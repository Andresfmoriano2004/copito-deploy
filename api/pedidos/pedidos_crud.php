<?php
// ─── POST /api/pedidos - crear ─────────────────────
if ($method === 'POST' && $path === 'pedidos') {
  $lugar = $body['lugar'] ?? '';
  $cliente = $body['cliente'] ?? '';
  if (!$lugar) jsonError('Lugar requerido');

  $existe = $pdo->prepare("SELECT id_pedido, usuario_id FROM pedidos WHERE lugar=? AND estado='Abierto'");
  $existe->execute([$lugar]);
  $row = $existe->fetch();
  if ($row) {
    if (($authUser['rol'] ?? '') === 'vendedor' && (int)($row['usuario_id'] ?? 0) !== (int)($authUser['id'] ?? 0)) {
      jsonError('Esta mesa tiene un pedido abierto por otro colaborador', 403);
    }
    jsonResponse(['success' => true, 'pedidoId' => $row['id_pedido'], 'mensaje' => "Pedido ya existe en $lugar", 'reabierto' => true]);
  }

  $id = generarId();
  // Datos fiscales: el POS suele completarlos con un PUT antes de cobrar,
  // pero se aceptan aquí por si vienen en la misma llamada de creación.
  $fis = datosClienteFiscal($body);
  $stmt = $pdo->prepare('INSERT INTO pedidos
      (id_pedido, lugar, cliente, usuario_id, vendedor,
       cliente_nit, cliente_dv, cliente_direccion, cliente_email, cliente_regimen, forma_pago)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  $stmt->execute([$id, $lugar, $cliente, $authUser['id'], $authUser['nombre'],
                  $fis['cliente_nit'], $fis['cliente_dv'], $fis['cliente_direccion'],
                  $fis['cliente_email'], $fis['cliente_regimen'], 'Contado']);
  auditLog($authUser, 'CREAR_PEDIDO', $id, $lugar);
  jsonResponse(['success' => true, 'pedidoId' => $id, 'mensaje' => "Pedido $id creado en $lugar"]);
}

if ($method === 'POST' && preg_match('#^pedidos/([^/]+)/cancelar$#', $path, $m)) {
  $id = $m[1];
  $motivo = trim($body['motivo'] ?? '');
  if (!$motivo) jsonError('El motivo de cancelación es obligatorio', 422);

  $pedido = fetchPedido($pdo, $id);
  if (!$pedido) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($pedido, $authUser);
  if ($pedido['estado'] !== 'Abierto') jsonError('Solo se pueden cancelar pedidos abiertos');

  // Verificar pagos existentes
  $pagStmt = $pdo->prepare('SELECT id, monto, metodo_pago, cuenta, detalle_id FROM pagos WHERE id_pedido=?');
  $pagStmt->execute([$id]);
  $pagosExistentes = $pagStmt->fetchAll();
  $totalPagado = array_sum(array_map(fn($p) => (float)$p['monto'], $pagosExistentes));

  // Verificar si hay pagos registrados en caja
  $cajaStmt = $pdo->prepare('SELECT id, id_caja, monto, tipo, metodo_pago, tipo_pago, descripcion FROM caja_movimientos WHERE id_pedido=? AND tipo=?');
  $cajaStmt->execute([$id, 'VENTA']);
  $movimientosCaja = $cajaStmt->fetchAll();

  // Obtener items para registrar en auditoría
  $itemsStmt = $pdo->prepare('SELECT id, codigo_producto, nombre_producto, cantidad, precio_unitario, subtotal, cuenta FROM detalle_pedido WHERE id_pedido=?');
  $itemsStmt->execute([$id]);
  $itemsPedido = $itemsStmt->fetchAll();

  $totalItems = array_sum(array_map(fn($i) => (float)$i['subtotal'], $itemsPedido));

  $pdo->beginTransaction();
  try {
    // Obtener caja activa para el egreso compensatorio
    $cajaActivaRow = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
    $idCajaActiva = $cajaActivaRow ? (int)$cajaActivaRow['id'] : null;

    // 1. Revertir movimientos de caja: crear EGRESO compensatorio
    $insEgreso = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, id_pedido, usuario_id) VALUES (?,?,?,?,?,?,?,?)');
    foreach ($movimientosCaja as $mov) {
      $idCajaDestino = $idCajaActiva ?: (int)$mov['id_caja'];
      $insEgreso->execute([
        $idCajaDestino,
        'EGRESO',
        $mov['metodo_pago'] ?: 'Efectivo',
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

    // 3. Revertir inventario: todo item con pagado=TRUE descontó stock al cobrarse
    $pagadosStmt = $pdo->prepare('SELECT id, codigo_producto, cantidad, nombre_producto FROM detalle_pedido WHERE id_pedido=? AND pagado=TRUE FOR UPDATE');
    $pagadosStmt->execute([$id]);
    $itemsPagados = $pagadosStmt->fetchAll();
    if ($itemsPagados) {
      $insMov = $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)');
      $updPag = $pdo->prepare('UPDATE detalle_pedido SET pagado=FALSE WHERE id=?');
      foreach ($itemsPagados as $ip) {
        // Lo que salió al cobrar hay que devolverlo igual (v11): si el producto
        // tiene receta, lo que se consumió fue materia prima y no producto
        // terminado — devolver producto habría creado stock de la nada.
        if (tieneReceta($pdo, $ip['codigo_producto'])) {
          devolverReceta($pdo, $ip['codigo_producto'], $ip['cantidad'],
            'Reversión por cancelación Pedido ' . $id . ' - ' . $ip['nombre_producto'], $authUser['id']);
        } else {
          $insMov->execute([$ip['codigo_producto'], 'INGRESO', $ip['cantidad'], 'Reversión por cancelación Pedido ' . $id . ' - ' . $ip['nombre_producto'], $authUser['id']]);
        }
        $updPag->execute([$ip['id']]);
      }
    }

    // 4. Auditoría completa con trazabilidad
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
      'stockRevertido' => count($itemsPagados),
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
    if ($itemsPagados) {
      $mensaje .= '. Se reversó inventario de ' . count($itemsPagados) . ' item(s) ya cobrado(s).';
    }
    if ($totalPagado > 0) {
      $mensaje .= '. Se reversaron $' . number_format($totalPagado, 0, ',', '.') . ' de caja (' . count($movimientosCaja) . ' movimiento(s)).';
    }
    jsonResponse(['success' => true, 'mensaje' => $mensaje, 'totalPagado' => $totalPagado, 'pagosRevertidos' => count($movimientosCaja), 'stockRevertido' => count($itemsPagados)]);

  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error cancelando pedido ' . $id . ': ' . $e->getMessage());
    jsonError('No se pudo cancelar el pedido', 500);
  }
}

// ─── PUT /api/pedidos/{id} - editar ────────────────
if ($method === 'PUT' && preg_match('#^pedidos/([^/]+)$#', $path, $m) && !str_contains($m[1], 'items')) {
  $id = $m[1];
  $ped = fetchPedido($pdo, $id);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($ped, $authUser);
  if ($ped['estado'] !== 'Abierto') jsonError('No se puede editar un pedido ' . $ped['estado'], 409);
  $sets = []; $vals = [];
  // 'notas' => 0 significa TEXT sin límite; el resto se recorta al tamaño
  // real de la columna para no depender del modo strict de MySQL.
  foreach (['cliente' => 200, 'lugar' => 50, 'notas' => 0, 'forma_pago' => 30] as $f => $max) {
    if (!isset($body[$f])) continue;
    $v = (string)$body[$f];
    if ($max > 0 && mb_strlen($v) > $max) $v = mb_substr($v, 0, $max);
    $sets[] = "$f=?";
    $vals[] = $v;
  }
  // Datos fiscales del cliente: solo se tocan los que el POS envió, para que
  // un PUT parcial no borre la dirección que ya estaba guardada.
  foreach (datosClienteFiscal($body) as $col => $val) {
    if (!array_key_exists($col, $body)) continue;
    $sets[] = "$col=?";
    $vals[] = $val;
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
  autorizarAccesoPedido($ped, $authUser);
  if ($ped['estado'] !== 'Abierto') jsonError('No se pueden agregar productos a un pedido ' . $ped['estado'], 409);
  $codigo = $body['codigo'] ?? '';
  $nombre = $body['nombre'] ?? '';
  $cantidad = (float)($body['cantidad'] ?? 0);
  $precioCliente = round((float)($body['precioUnitario'] ?? 0), 2);
  $notas = $body['notas'] ?? '';
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;
  if (!$codigo || !$cantidad || $cantidad <= 0) jsonError('Código y cantidad válidos requeridos');
  if ($precioCliente < 0) jsonError('El precio no puede ser negativo');
  if ($cuenta !== null && !validarCuentaPedido($pdo, $id, $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  $pRow = getProductoPrecio($pdo, $codigo);
  if (!$pRow) jsonError('Producto no encontrado', 404);
  if (!$nombre) $nombre = $pRow['nombre'];
  // El precio lo fija el catálogo: solo un admin puede aplicar otro (aplicarPrecioItem)
  $precio = aplicarPrecioItem($precioCliente, (float)$pRow['precio'], $authUser);

  // Stock híbrido (v11): con receta se mide contra la materia prima; sin
  // receta, contra el producto terminado. El mensaje ya viene redactado.
  $checkStock = checkStockVenta($pdo, $codigo, $cantidad);
  if ($checkStock !== true) jsonError($checkStock);

  $subtotal = round($cantidad * $precio, 2);
  // El precio ya incluye IVA: se guarda la línea desgranada para que el
  // comprobante pueda mostrar base e impuesto por ítem.
  $imp = calcularImpuestoItem($subtotal, $pRow['iva_porcentaje'] ?? 19);

  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare('INSERT INTO detalle_pedido
        (id_pedido, codigo_producto, nombre_producto, cantidad, precio_unitario,
         subtotal, notas, cuenta, unidad, tipo_item, iva_porcentaje, base_gravable, iva_valor)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([$id, $codigo, $nombre, $cantidad, $precio, $subtotal, $notas, $cuenta,
                    $pRow['unidad'] ?: 'Und', $pRow['tipo_item'] ?: 'Bien',
                    $imp['pct'], $imp['base'], $imp['iva']]);
    // El id se captura YA, antes de cualquier otra escritura. Tres cosas lo
    // pisaban y el POS recibía siempre `detalleId: 0` (y con 0,
    // `res.detalleId || res.id` en pos_controller.js caía a undefined, así que
    // el carrito nunca se marcaba sincronizado y reintentaba el sync):
    //   · updatePedidoTotal() hace un UPDATE,
    //   · auditLog() INSERTA en `auditoria` y ese id reemplaza al anterior,
    //   · commit() deja LAST_INSERT_ID() en 0 en MariaDB 10.4.
    $detalleId = (int)$pdo->lastInsertId();
    updatePedidoTotal($pdo, $id);

    auditLog($authUser, 'AGREGAR_PRODUCTO_PEDIDO', $id, null, [
      'codigo' => $codigo,
      'nombre' => $nombre,
      'cantidad' => $cantidad,
      'precio' => $precio,
      'subtotal' => (float)$subtotal
    ]);

    $pdo->commit();
    jsonResponse(['success' => true, 'mensaje' => 'Item agregado al pedido', 'detalleId' => $detalleId]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudo agregar el item', 500);
  }
}

// ─── PUT /api/pedidos/items/{detalleId} ────────────
if ($method === 'PUT' && preg_match('#^pedidos/items/(\d+)$#', $path, $m)) {
  $detId = (int)$m[1];
  $cantidad = (float)($body['cantidad'] ?? 0);
  $precioCliente = round((float)($body['precioUnitario'] ?? 0), 2);
  $notas = $body['notas'] ?? '';
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;
  if (!$cantidad || $cantidad <= 0) jsonError('La cantidad debe ser mayor a 0');
  if ($precioCliente < 0) jsonError('El precio no puede ser negativo');

  $det = $pdo->prepare('SELECT p.estado, p.usuario_id, d.id_pedido, d.pagado, d.cantidad, d.codigo_producto, d.precio_unitario, d.subtotal, d.nombre_producto, d.unidad, d.tipo_item, d.iva_porcentaje FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE d.id=?');
  $det->execute([$detId]);
  $row = $det->fetch();
  if (!$row) jsonError('Item no encontrado', 404);
  autorizarAccesoPedido($row, $authUser);
  if ($row['estado'] !== 'Abierto') jsonError('No se puede modificar un pedido ' . $row['estado'], 409);
  if ($cuenta !== null && !validarCuentaPedido($pdo, $row['id_pedido'], $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  // Bloquear edición si el item ya fue pagado
  if ((int)$row['pagado'] === 1) {
    jsonError('No se puede modificar un item que ya fue pagado. Anule el pago primero.', 409);
  }

  // El precio lo fija el catálogo: solo un admin puede aplicar otro.
  // $precioActual (precio ya guardado) evita rechazar una simple edición de
  // cantidad sobre un ítem cuyo precio ajustó un admin.
  $prodRow = getProductoPrecio($pdo, $row['codigo_producto']);
  $precioCatalogo = $prodRow ? (float)$prodRow['precio'] : (float)$row['precio_unitario'];
  $precio = aplicarPrecioItem($precioCliente, $precioCatalogo, $authUser, (float)$row['precio_unitario']);
  $subtotal = round($cantidad * $precio, 2);

  // Si el producto sigue en catálogo se toman sus datos fiscales actuales;
  // si fue borrado, se conservan los que ya traía la línea.
  if ($prodRow) {
    $unidad = $prodRow['unidad'] ?: 'Und';
    $tipo   = $prodRow['tipo_item'] ?: 'Bien';
    $pctIva = (float)$prodRow['iva_porcentaje'];
  } else {
    $unidad = $row['unidad'] ?: 'Und';
    $tipo   = $row['tipo_item'] ?: 'Bien';
    $pctIva = (float)$row['iva_porcentaje'];
  }
  $imp = calcularImpuestoItem($subtotal, $pctIva);

  $pdo->beginTransaction();
  try {
    $pdo->prepare('UPDATE detalle_pedido
                    SET cantidad=?, precio_unitario=?, subtotal=?, notas=?, cuenta=?,
                        unidad=?, tipo_item=?, iva_porcentaje=?, base_gravable=?, iva_valor=?
                  WHERE id=?')
        ->execute([$cantidad, $precio, $subtotal, $notas, $cuenta,
                   $unidad, $tipo, $imp['pct'], $imp['base'], $imp['iva'], $detId]);
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
    error_log('Copito error modificando item ' . $detId . ': ' . $e->getMessage());
    jsonError('No se pudo modificar el item', 500);
  }
}

// ─── DELETE /api/pedidos/items/{detalleId} ─────────
if ($method === 'DELETE' && preg_match('#^pedidos/items/(\d+)$#', $path, $m)) {
  $detId = (int)$m[1];
  $det = $pdo->prepare('SELECT p.estado, p.usuario_id, d.id_pedido, d.pagado, d.codigo_producto, d.nombre_producto, d.cantidad, d.precio_unitario, d.subtotal, d.cuenta FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE d.id=?');
  $det->execute([$detId]);
  $detRow = $det->fetch();
  if (!$detRow) jsonError('Item no encontrado', 404);
  autorizarAccesoPedido($detRow, $authUser);
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