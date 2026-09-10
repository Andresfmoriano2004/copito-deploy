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
  $motivo = trim($body['motivo'] ?? 'Cancelado por colaborador');
  $pedido = fetchPedido($pdo, $id);
  if (!$pedido) jsonError('Pedido no encontrado', 404);
  if ($pedido['estado'] !== 'Abierto') jsonError('Solo se pueden cancelar pedidos abiertos');
  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare("UPDATE pedidos SET estado='Cancelado', cancelado_por=?, cancelado_en=NOW(), cancelacion_motivo=?, fecha_cierre=NOW() WHERE id_pedido=? AND estado='Abierto'");
    $stmt->execute([$authUser['id'], $motivo, $id]);
    if ($stmt->rowCount() === 0) { $pdo->rollBack(); jsonError('El pedido ya no está abierto (otro colaborador pudo cerrarlo o cancelarlo)', 409); }
    auditLog($authUser, 'CANCELAR_PEDIDO', $id, $pedido['lugar'], ['motivo' => $motivo]);
    $pdo->commit();
  } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError('No se pudo cancelar el pedido', 500); }
  jsonResponse(['success' => true, 'mensaje' => 'Pedido cancelado y mesa liberada']);
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
  $codigo = $body['codigo'] ?? ''; $nombre = $body['nombre'] ?? '';
  $cantidad = (float)($body['cantidad'] ?? 0); $precio = (float)($body['precioUnitario'] ?? 0);
  $notas = $body['notas'] ?? ''; $cuenta = $body['cuenta'] ?? null;
  if (!$codigo || !$cantidad) jsonError('Código y cantidad requeridos');

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

  $subtotal = round($cantidad * $precio, 2);
  $stmt = $pdo->prepare('INSERT INTO detalle_pedido (id_pedido, codigo_producto, nombre_producto, cantidad, precio_unitario, subtotal, notas, cuenta) VALUES (?,?,?,?,?,?,?,?)');
  $stmt->execute([$id, $codigo, $nombre, $cantidad, $precio, $subtotal, $notas, $cuenta]);

  updatePedidoTotal($pdo, $id);
  auditLog($authUser, 'AGREGAR_PRODUCTO_PEDIDO', $id, null, ['codigo' => $codigo, 'cantidad' => $cantidad]);

  jsonResponse(['success' => true, 'mensaje' => 'Item agregado al pedido']);
}

// ─── PUT /api/pedidos/items/{detalleId} ────────────
if ($method === 'PUT' && preg_match('#^pedidos/items/(\d+)$#', $path, $m)) {
  $detId = (int)$m[1];
  $cantidad = (float)($body['cantidad'] ?? 0); $precio = (float)($body['precioUnitario'] ?? 0);
  $notas = $body['notas'] ?? ''; $cuenta = $body['cuenta'] ?? null;
  if (!$cantidad || !$precio) jsonError('Cantidad y precio requeridos');

  $subtotal = round($cantidad * $precio, 2);
  $det = $pdo->prepare('SELECT p.estado, d.id_pedido FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE d.id=?');
  $det->execute([$detId]);
  $row = $det->fetch();
  if (!$row) jsonError('Item no encontrado', 404);
  if ($row['estado'] !== 'Abierto') jsonError('No se puede modificar un pedido ' . $row['estado'], 409);

  $pdo->prepare('UPDATE detalle_pedido SET cantidad=?, precio_unitario=?, subtotal=?, notas=?, cuenta=? WHERE id=?')->execute([$cantidad, $precio, $subtotal, $notas, $cuenta, $detId]);
  updatePedidoTotal($pdo, $row['id_pedido']);
  auditLog($authUser, 'MODIFICAR_PRODUCTO_PEDIDO', $row['id_pedido'], null, ['detalleId' => $detId]);
  jsonResponse(['success' => true, 'mensaje' => 'Item modificado']);
}

// ─── DELETE /api/pedidos/items/{detalleId} ─────────
if ($method === 'DELETE' && preg_match('#^pedidos/items/(\d+)$#', $path, $m)) {
  $detId = (int)$m[1];
  $det = $pdo->prepare('SELECT p.estado, d.id_pedido FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE d.id=?');
  $det->execute([$detId]);
  $detRow = $det->fetch();
  if (!$detRow) jsonError('Item no encontrado', 404);
  if ($detRow['estado'] !== 'Abierto') jsonError('No se puede eliminar de un pedido ' . $detRow['estado'], 409);
  $pedidoId = $detRow['id_pedido'];

  $pdo->prepare('DELETE FROM detalle_pedido WHERE id=?')->execute([$detId]);
  updatePedidoTotal($pdo, $pedidoId);
  auditLog($authUser, 'ELIMINAR_PRODUCTO_PEDIDO', $pedidoId);
  jsonResponse(['success' => true, 'mensaje' => 'Item eliminado']);
}