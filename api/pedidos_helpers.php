<?php
// ─── Helpers compartidos para pedidos ─────────────────

function generarId() {
  return 'PED-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -5));
}

if (!function_exists('tipoPago')) {
  function tipoPago($metodo) {
    $m = function_exists('normalizarMetodoPago') ? normalizarMetodoPago($metodo) : $metodo;
    return $m === 'Efectivo' ? 'FISICO' : 'BANCARIO';
  }
}

function registrarPagos($pdo, $idPedido, $cuenta, $pagos) {
  $stmt = $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, usuario_id, mesa) SELECT ?,?,?,?,?,lugar FROM pedidos WHERE id_pedido=?');
  foreach ($pagos as $p) {
    $stmt->execute([$idPedido, $cuenta, $p['metodoPago'], round($p['monto']), $GLOBALS['authUser']['id'], $idPedido]);
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
    $pagos = array_map(fn($p) => ['metodoPago' => normalizarMetodoPago($p['metodoPago'] ?? ''), 'monto' => round((float)($p['monto'] ?? 0))], $body['pagos']);
    foreach ($pagos as $i => $p) {
      if (!validarMetodoPago($p['metodoPago'])) jsonError("Método de pago inválido en pago #" . ($i + 1) . ". Use Efectivo o Transferencia");
      if ($p['monto'] <= 0) jsonError("El monto del pago #" . ($i + 1) . " debe ser mayor a cero");
      if ($p['monto'] > 999999999) jsonError("El monto del pago #" . ($i + 1) . " excede el máximo permitido");
    }
    $sumaPagos = round(array_sum(array_column($pagos, 'monto')), 2);
    if ($sumaPagos > round($total, 2) + 0.01) jsonError('El valor pagado ($' . number_format($sumaPagos, 0, ',', '.') . ') no puede superar el total ($' . number_format($total, 0, ',', '.') . ')');
    return $pagos;
  }
  if (!empty($body['metodoPago'])) {
    $body['metodoPago'] = normalizarMetodoPago($body['metodoPago']);
    if (!validarMetodoPago($body['metodoPago'])) jsonError('Método de pago no permitido. Use Efectivo o Transferencia');
    if ($total <= 0) jsonError('El total debe ser mayor a cero para registrar un pago');
    return [['metodoPago' => $body['metodoPago'], 'monto' => round($total, 2)]];
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
  $sum = $pdo->prepare('SELECT COALESCE(ROUND(SUM(subtotal),2),0) AS total FROM detalle_pedido WHERE id_pedido=?');
  $sum->execute([$id]);
  $total = round((float)$sum->fetch()['total'], 2);
  $pdo->prepare('UPDATE pedidos SET total=? WHERE id_pedido=?')->execute([$total, $id]);
}

function checkStock($pdo, $codigo, $cantidad) {
  $stock = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0) AS stock_actual FROM movimientos WHERE codigo_producto=?");
  $stock->execute([$codigo]);
  return round((float)$stock->fetch()['stock_actual'], 2) >= round($cantidad, 2);
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

function validarCuentaPedido($pdo, $idPedido, $cuenta) {
  if ($cuenta === null) return true;
  $cuenta = strtoupper(trim($cuenta));
  if (strlen($cuenta) !== 1 || $cuenta < 'A' || $cuenta > 'Z') return false;
  $stmt = $pdo->prepare('SELECT cuentas_activas FROM pedidos WHERE id_pedido=?');
  $stmt->execute([$idPedido]);
  $row = $stmt->fetch();
  if ($row && $row['cuentas_activas']) {
    $activas = explode(',', $row['cuentas_activas']);
    if (in_array($cuenta, $activas)) return true;
  }
  $det = $pdo->prepare('SELECT DISTINCT cuenta FROM detalle_pedido WHERE id_pedido=? AND cuenta IS NOT NULL');
  $det->execute([$idPedido]);
  $existentes = array_column($det->fetchAll(), 'cuenta');
  return in_array($cuenta, $existentes);
}