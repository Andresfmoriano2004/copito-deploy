<?php
// ─── Helpers compartidos para pedidos ─────────────────

function generarId() {
  return 'PED-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -5));
}

function tipoPago($metodo) {
  $fisico = ['Efectivo'];
  return in_array($metodo, $fisico) ? 'FISICO' : 'BANCARIO';
}

function registrarPagos($pdo, $idPedido, $cuenta, $pagos) {
  $stmt = $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, usuario_id, mesa) SELECT ?,?,?,?,?,lugar FROM pedidos WHERE id_pedido=?');
  foreach ($pagos as $p) {
    $stmt->execute([$idPedido, $cuenta, $p['metodoPago'], $p['monto'], $GLOBALS['authUser']['id'], $idPedido]);
  }
}

function registrarVentaEnCaja($pdo, $idPedido, $pagos, $desc, $userId) {
  $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
  if (!$caja) return;
  $stmt = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, id_pedido, usuario_id) VALUES (?,?,?,?,?,?,?,?)');
  foreach ($pagos as $p) {
    $stmt->execute([$caja['id'], 'VENTA', $p['metodoPago'], tipoPago($p['metodoPago']), $desc, $p['monto'], $idPedido, $userId]);
  }
}

function parsePagos($body, $total) {
  if (!empty($body['pagos']) && is_array($body['pagos'])) {
    $pagos = array_map(fn($p) => ['metodoPago' => normalizarMetodoPago($p['metodoPago'] ?? ''), 'monto' => (float)($p['monto'] ?? 0)], $body['pagos']);
    foreach ($pagos as $p) if (!validarMetodoPago($p['metodoPago']) || $p['monto'] <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
    if (array_sum(array_column($pagos, 'monto')) > $total + 0.01) jsonError('El valor pagado no puede superar el total');
    return $pagos;
  }
  if (!empty($body['metodoPago'])) {
    $body['metodoPago'] = normalizarMetodoPago($body['metodoPago']);
    if (!validarMetodoPago($body['metodoPago'])) jsonError('Método de pago no permitido. Use Efectivo o Transferencia');
    return [['metodoPago' => $body['metodoPago'], 'monto' => $total]];
  }
  return null;
}

function fetchPedido($pdo, $id) {
  $stmt = $pdo->prepare('SELECT * FROM pedidos WHERE id_pedido=?');
  $stmt->execute([$id]);
  return $stmt->fetch();
}

function fetchPedidoItems($pdo, $id) {
  $det = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? ORDER BY cuenta, id');
  $det->execute([$id]);
  return array_map(fn($d) => [
    'id' => (int)$d['id'], 'codigo' => $d['codigo_producto'], 'nombre' => $d['nombre_producto'],
    'cantidad' => (float)$d['cantidad'], 'precioUnitario' => (float)$d['precio_unitario'],
    'subtotal' => (float)$d['subtotal'], 'notas' => $d['notas'] ?? '', 'cuenta' => $d['cuenta'] ?? null,
    'pagado' => (bool)$d['pagado']
  ], $det->fetchAll());
}

function fetchPedidoPagos($pdo, $id) {
  $pagStmt = $pdo->prepare('SELECT p.*, d.nombre_producto AS item_nombre FROM pagos p LEFT JOIN detalle_pedido d ON d.id=p.detalle_id WHERE p.id_pedido=? ORDER BY p.id');
  $pagStmt->execute([$id]);
  return array_map(fn($p) => [
    'id' => (int)$p['id'], 'cuenta' => $p['cuenta'] ?? null, 'metodoPago' => $p['metodo_pago'],
    'monto' => (float)$p['monto'], 'fecha' => $p['fecha'],
    'fechaHora' => fmtFechaHoraBogota($p['fecha'] ?? null),
    'hora' => fmtHoraBogota($p['fecha'] ?? null),
    'itemNombre' => $p['item_nombre'] ?? null,
    'detalleId' => $p['detalle_id'] !== null ? (int)$p['detalle_id'] : null
  ], $pagStmt->fetchAll());
}

function updatePedidoTotal($pdo, $id) {
  $sum = $pdo->prepare('SELECT COALESCE(SUM(subtotal),0) AS total FROM detalle_pedido WHERE id_pedido=?');
  $sum->execute([$id]);
  $pdo->prepare('UPDATE pedidos SET total=? WHERE id_pedido=?')->execute([$sum->fetch()['total'], $id]);
}

function checkStock($pdo, $codigo, $cantidad) {
  $stock = $pdo->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),0) AS stock_actual FROM movimientos WHERE codigo_producto=?");
  $stock->execute([$codigo]);
  return (float)$stock->fetch()['stock_actual'] >= $cantidad;
}

function getProductoPrecio($pdo, $codigo) {
  $prod = $pdo->prepare('SELECT precio, nombre FROM productos WHERE codigo=?');
  $prod->execute([$codigo]);
  return $prod->fetch();
}

function registrarMovimientosStock($pdo, $items, $notaBase) {
  $insMov = $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)');
  $updPag = $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?');
  foreach ($items as $item) {
    $insMov->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], $notaBase . " - " . $item['nombre_producto'], $GLOBALS['authUser']['id']]);
    $updPag->execute([$item['id']]);
  }
}