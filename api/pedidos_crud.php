<?php
// ─── POST /api/pedidos - crear ─────────────────────
if ($method === 'POST' && $path === 'pedidos') {
  $lugar = $body['lugar'] ?? '';
  $cliente = $body['cliente'] ?? '';
  if (!$lugar) jsonError('Lugar requerido');

  $existe = $pdo->prepare("SELECT id_pedido FROM pedidos WHERE lugar=? AND estado='Abierto'");
  $existe->execute([$lugar]);
  $row = $existe->fetch();
  if ($row) {
    jsonResponse(['success' => true, 'pedidoId' => $row['id_pedido'], 'mensaje' => "Pedido ya existe en $lugar", 'reabierto' => true]);
  }

  $id = generarId();
  $stmt = $pdo->prepare('INSERT INTO pedidos (id_pedido, lugar, cliente, usuario_id, vendedor) VALUES (?,?,?,?,?)');
  $stmt->execute([$id, $lugar, $cliente, $authUser['id'], $authUser['nombre']]);
  auditLog($authUser, 'CREAR_PEDIDO', $id, $lugar);
  jsonResponse(['success' => true, 'pedidoId' => $id, 'mensaje' => "Pedido $id creado en $lugar"]);
}

if ($method === 'POST' && preg_match('#^pedidos/([^/]+)/cancelar$#', $path, $m)) {
  $id = $m[1];
  $motivo = trim($body['motivo'] ?? '');
  if (!$motivo) jsonError('El motivo de cancelación es obligatorio', 422);

  $pedido = fetchPedido($pdo, $id);
  if (!$pedido) jsonError('Pedido no encontrado', 404);
  if ($pedido['estado'] !== 'Abierto') jsonError('Solo se pueden cancelar pedidos abiertos');

  // Verificar pagos existentes
  $pagStmt = $pdo->prepare('SELECT id, monto, metodo_pago, cuenta, detalle_id FROM pagos WHERE id_pedido=?');
  $pagStmt->execute([$id]);
  $pagosExistentes = $pagStmt->fetchAll();
  $totalPagado = array_sum(array_map(fn($p) => (float)$p['monto'], $pagosExistentes));

  // Verificar si hay pagos registrados en caja
  $cajaStmt = $pdo->prepare('SELECT id, monto, tipo, tipo_pago, descripcion FROM caja_movimientos WHERE id_pedido=? AND tipo=?');
  $cajaStmt->execute([$id, 'VENTA']);
  $movimientosCaja = $cajaStmt->fetchAll();

  // Obtener items para registrar en auditoría
  $itemsStmt = $pdo->prepare('SELECT id, codigo_producto, nombre_producto, cantidad, precio_unitario, subtotal, cuenta FROM detalle_pedido WHERE id_pedido=?');
  $itemsStmt->execute([$id]);
  $itemsPedido = $itemsStmt->fetchAll();

  $totalItems = array_sum(array_map(fn($i) => (float)$i['subtotal'], $itemsPedido));

  $pdo->beginTransaction();
  try {
    // 1. Revertir movimientos de caja: crear EGRESO compensatorio
    $insEgreso = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, id_pedido, usuario_id) VALUES (?,?,?,?,?,?,?,?)');
    foreach ($movimientosCaja as $mov) {
      $insEgreso->execute([
        $mov['id'],
        'EGRESO',
        'Efectivo',
        $mov['tipo_pago'] ?? 'FISICO',
        'Reversión por cancelación Pedido ' . $id . ': ' . $mov['descripcion'],
        $mov['monto'],
        $id,
        $authUser['id']
      ]);
    }

    // 2. Actualizar estado del pedido
    $stmt = $pdo->prepare("UPDATE pedidos SET estado='Cancelado', cancelado_por=?, cancelado_en=NOW(), cancelacion_motivo=?, fecha_cierre=NOW() WHERE id_pedido=? AND estado='Abierto'");
    $stmt->execute([$authUser['id'], $motivo, $id]);
    if ($stmt->rowCount() === 0) {
      $pdo->rollBack();
      jsonError('El pedido ya no está abierto (otro colaborador pudo cerrarlo o cancelarlo)', 409);
    }

    // 3. Auditoría completa con trazabilidad
    auditLog($authUser, 'CANCELAR_PEDIDO', $id, $pedido['lugar'], [
      'motivo' => $motivo,
      'estadoAnterior' => 'Abierto',
      'estadoPosterior' => 'Cancelado',
      'totalPedido' => (float)$pedido['total'],
      'totalItems' => $totalItems,
      'totalPagado' => $totalPagado,
      'saldoPendiente' => $totalItems - $totalPagado,
      'pagosExistentes' => count($pagosExistentes),
      'pagosRevertidos' => count($movimientosCaja),
      'itemsCancelados' => array_map(fn($i) => [
        'codigo' => $i['codigo_producto'],
        'nombre' => $i['nombre_producto'],
        'cantidad' => (float)$i['cantidad'],
        'precio' => (float)$i['precio_unitario'],
        'subtotal' => (float)$i['subtotal'],
        'cuenta' => $i['cuenta']
      ], $itemsPedido)
    ]);

    $pdo->commit();

    $mensaje = 'Pedido cancelado y mesa liberada';
    if ($totalPagado > 0) {
      $mensaje .= '. Se reversaron $' . number_format($totalPagado, 0, ',', '.') . ' de caja (' . count($movimientosCaja) . ' movimiento(s)).';
    }
    jsonResponse(['success' => true, 'mensaje' => $mensaje, 'totalPagado' => $totalPagado, 'pagosRevertidos' => count($movimientosCaja)]);

  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudo cancelar el pedido: ' . $e->getMessage(), 500);
  }
}

// ─── PUT /api/pedidos/{id} - editar ────────────────
if ($method === 'PUT' && preg_match('#^pedidos/([^/]+)$#', $path, $m) && !str_contains($m[1], 'items')) {
  $id = $m[1];
  $ped = fetchPedido($pdo, $id);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  if ($ped['estado'] !== 'Abierto') jsonError('No se puede editar un pedido ' . $ped['estado'], 409);
  $sets = []; $vals = [];
  foreach (['cliente', 'lugar', 'notas'] as $f) {
    if (isset($body[$f])) { $sets[] = "$f=?"; $vals[] = $body[$f]; }
  }
  if (isset($body['cuentasActivas']) && is_array($body['cuentasActivas'])) {
    $sets[] = 'cuentas_activas=?';
    $vals[] = implode(',', $body['cuentasActivas']);
  }
  if (!$sets) jsonError('Nada que actualizar');
  $vals[] = $id;
  $pdo->prepare("UPDATE pedidos SET " . implode(',', $sets) . " WHERE id_pedido=?")->execute($vals);
  auditLog($authUser, 'MODIFICAR_PEDIDO', $id, $ped['lugar'], $body);
  jsonResponse(['success' => true, 'mensaje' => 'Pedido actualizado']);
}

// ─── POST /api/pedidos/{id}/items - agregar item ───
if ($method === 'POST' && preg_match('#^pedidos/(.+)/items$#', $path, $m)) {
  $id = $m[1];
  $ped = fetchPedido($pdo, $id);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  if ($ped['estado'] !== 'Abierto') jsonError('No se pueden agregar productos a un pedido ' . $ped['estado'], 409);
  $codigo = $body['codigo'] ?? '';
  $nombre = $body['nombre'] ?? '';
  $cantidad = (float)($body['cantidad'] ?? 0);
  $precio = round((float)($body['precioUnitario'] ?? 0));
  $notas = $body['notas'] ?? '';
  $cuenta = $body['cuenta'] ?? null;
  if (!$codigo || !$cantidad || $cantidad <= 0) jsonError('Código y cantidad válidos requeridos');
  if ($precio < 0) jsonError('El precio no puede ser negativo');
  if ($cuenta !== null && !validarCuentaPedido($pdo, $id, $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  if (!$precio) {
    $pRow = getProductoPrecio($pdo, $codigo);
    if (!$pRow) jsonError('Producto no encontrado');
    $precio = (float)$pRow['precio'];
    if (!$nombre) $nombre = $pRow['nombre'];
  }
  if (!$nombre) {
    $pRow = getProductoPrecio($pdo, $codigo);
    $nombre = $pRow ? $pRow['nombre'] : $codigo;
  }

  if (!checkStock($pdo, $codigo, $cantidad)) jsonError("Stock insuficiente");

  $subtotal = round($cantidad * $precio);

  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare('INSERT INTO detalle_pedido (id_pedido, codigo_producto, nombre_producto, cantidad, precio_unitario, subtotal, notas, cuenta) VALUES (?,?,?,?,?,?,?,?)');
    $stmt->execute([$id, $codigo, $nombre, $cantidad, $precio, $subtotal, $notas, $cuenta]);
    updatePedidoTotal($pdo, $id);

    auditLog($authUser, 'AGREGAR_PRODUCTO_PEDIDO', $id, null, [
      'codigo' => $codigo,
      'nombre' => $nombre,
      'cantidad' => $cantidad,
      'precio' => $precio,
      'subtotal' => (float)$subtotal
    ]);

    $pdo->commit();
    jsonResponse(['success' => true, 'mensaje' => 'Item agregado al pedido', 'detalleId' => (int)$pdo->lastInsertId()]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudo agregar el item', 500);
  }
}

// ─── PUT /api/pedidos/items/{detalleId} ────────────
if ($method === 'PUT' && preg_match('#^pedidos/items/(\d+)$#', $path, $m)) {
  $detId = (int)$m[1];
  $cantidad = (float)($body['cantidad'] ?? 0);
  $precio = round((float)($body['precioUnitario'] ?? 0));
  $notas = $body['notas'] ?? '';
  $cuenta = $body['cuenta'] ?? null;
  if (!$cantidad || $cantidad <= 0) jsonError('La cantidad debe ser mayor a 0');
  if ($precio < 0) jsonError('El precio no puede ser negativo');

  $subtotal = round($cantidad * $precio);

  $det = $pdo->prepare('SELECT p.estado, d.id_pedido, d.pagado, d.cantidad, d.precio_unitario, d.subtotal, d.nombre_producto FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE d.id=?');
  $det->execute([$detId]);
  $row = $det->fetch();
  if (!$row) jsonError('Item no encontrado', 404);
  if ($row['estado'] !== 'Abierto') jsonError('No se puede modificar un pedido ' . $row['estado'], 409);
  if ($cuenta !== null && !validarCuentaPedido($pdo, $row['id_pedido'], $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  // Bloquear edición si el item ya fue pagado
  if ((int)$row['pagado'] === 1) {
    jsonError('No se puede modificar un item que ya fue pagado. Anule el pago primero.', 409);
  }

  $pdo->beginTransaction();
  try {
    $pdo->prepare('UPDATE detalle_pedido SET cantidad=?, precio_unitario=?, subtotal=?, notas=?, cuenta=? WHERE id=?')->execute([$cantidad, $precio, $subtotal, $notas, $cuenta, $detId]);
    updatePedidoTotal($pdo, $row['id_pedido']);

    auditLog($authUser, 'MODIFICAR_PRODUCTO_PEDIDO', $row['id_pedido'], null, [
      'detalleId' => $detId,
      'producto' => $row['nombre_producto'],
      'antes' => ['cantidad' => (float)$row['cantidad'], 'precio' => (float)$row['precio_unitario'], 'subtotal' => (float)$row['subtotal']],
      'despues' => ['cantidad' => $cantidad, 'precio' => $precio, 'subtotal' => (float)$subtotal]
    ]);

    $pdo->commit();
    jsonResponse(['success' => true, 'mensaje' => 'Item modificado']);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudo modificar el item', 500);
  }
}

// ─── DELETE /api/pedidos/items/{detalleId} ─────────
if ($method === 'DELETE' && preg_match('#^pedidos/items/(\d+)$#', $path, $m)) {
  $detId = (int)$m[1];
  $det = $pdo->prepare('SELECT p.estado, d.id_pedido, d.pagado, d.codigo_producto, d.nombre_producto, d.cantidad, d.precio_unitario, d.subtotal, d.cuenta FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE d.id=?');
  $det->execute([$detId]);
  $detRow = $det->fetch();
  if (!$detRow) jsonError('Item no encontrado', 404);
  if ($detRow['estado'] !== 'Abierto') jsonError('No se puede eliminar de un pedido ' . $detRow['estado'], 409);

  // Bloquear eliminación si el item ya fue pagado
  if ((int)$detRow['pagado'] === 1) {
    jsonError('No se puede eliminar un item que ya fue pagado. Anule el pago primero.', 409);
  }

  $pedidoId = $detRow['id_pedido'];

  $pdo->beginTransaction();
  try {
    $pdo->prepare('DELETE FROM detalle_pedido WHERE id=?')->execute([$detId]);
    updatePedidoTotal($pdo, $pedidoId);

    auditLog($authUser, 'ELIMINAR_PRODUCTO_PEDIDO', $pedidoId, null, [
      'detalleId' => $detId,
      'producto' => $detRow['nombre_producto'],
      'codigo' => $detRow['codigo_producto'],
      'cantidad' => (float)$detRow['cantidad'],
      'precio' => (float)$detRow['precio_unitario'],
      'subtotal' => (float)$detRow['subtotal'],
      'cuenta' => $detRow['cuenta']
    ]);

    $pdo->commit();
    jsonResponse(['success' => true, 'mensaje' => 'Item eliminado']);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudo eliminar el item', 500);
  }
}