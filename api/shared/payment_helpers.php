<?php
// ─── Shared payment helpers ────────────────────────────────────────────────

/**
 * Validate and normalize payment methods from request body.
 * Returns normalized pagos array.
 */
function parsePagosFromBody($pagos) {
  if (!is_array($pagos) || empty($pagos)) jsonError('Método(s) de pago requerido(s)');
  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    $p['monto'] = round((float)($p['monto'] ?? 0), 2);
    if (!validarMetodoPago($p['metodoPago']) || $p['monto'] <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);
  return $pagos;
}

/**
 * Allocate payment amount across unpaid items within a scope.
 * Creates pago records per item for traceability.
 * Returns the remaining unallocated amount.
 */
function allocatePaymentsToItems($pdo, $idPedido, $cuenta, $items, $montoTotal, $metodoPago, $userId, $lugar, $notaPrefix = '') {
  $restante = round($montoTotal, 2);

  // Get already-paid amounts per item to avoid overpayment on repeated calls
  $paidMap = [];
  if (!empty($items)) {
    $ids = array_map(fn($i) => (int)$i['id'], $items);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $paidStmt = $pdo->prepare("SELECT detalle_id, COALESCE(ROUND(SUM(monto),2),0) AS pagado FROM pagos WHERE detalle_id IN ($ph) GROUP BY detalle_id");
    $paidStmt->execute($ids);
    foreach ($paidStmt->fetchAll() as $row) $paidMap[(int)$row['detalle_id']] = round((float)$row['pagado'], 2);
  }

  $ins = $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, detalle_id, metodo_pago, monto, notas, usuario_id, mesa) VALUES (?,?,?,?,?,?,?,?)');
  foreach ($items as $item) {
    if ($restante <= 0) break;
    $montoItem = round((float)$item['subtotal'], 2);
    $yaPagado = round($paidMap[(int)$item['id']] ?? 0, 2);
    $pendienteItem = round(max(0, $montoItem - $yaPagado), 2);
    if ($pendienteItem <= 0) continue;
    $aPagar = round(min($restante, $pendienteItem), 2);
    $nota = $notaPrefix ? "$notaPrefix: {$item['nombre_producto']}" : $item['nombre_producto'];
    $ins->execute([$idPedido, $cuenta, (int)$item['id'], $metodoPago, $aPagar, $nota, $userId, $lugar]);
    $restante = round($restante - $aPagar, 2);
  }
  if (round($restante, 2) > 0) {
    $nota = $notaPrefix ? "$notaPrefix general" : 'Pago general';
    $ins->execute([$idPedido, $cuenta, null, $metodoPago, $restante, $nota, $userId, $lugar]);
  }
  return $restante;
}

/**
 * Get unpaid items within a scope (order or account).
 */
function getUnpaidItems($pdo, $idPedido, $cuenta = null) {
  if ($cuenta !== null) {
    $stmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL)) AND pagado=FALSE');
    $stmt->execute([$idPedido, $cuenta, $cuenta]);
  } else {
    $stmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
    $stmt->execute([$idPedido]);
  }
  return $stmt->fetchAll();
}

/**
 * Get total paid for a scope (order or account).
 */
function getPreviouslyPaid($pdo, $idPedido, $cuenta = null) {
  if ($cuenta !== null) {
    $stmt = $pdo->prepare('SELECT COALESCE(ROUND(SUM(monto),2),0) AS t FROM pagos WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL))');
    $stmt->execute([$idPedido, $cuenta, $cuenta]);
  } else {
    $stmt = $pdo->prepare('SELECT COALESCE(ROUND(SUM(monto),2),0) AS t FROM pagos WHERE id_pedido=?');
    $stmt->execute([$idPedido]);
  }
  return round((float)$stmt->fetch()['t'], 2);
}

/**
 * Get total of items in a scope.
 */
function getScopeTotal($pdo, $idPedido, $cuenta = null) {
  if ($cuenta !== null) {
    $stmt = $pdo->prepare('SELECT COALESCE(ROUND(SUM(subtotal),2),0) AS total FROM detalle_pedido WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL))');
    $stmt->execute([$idPedido, $cuenta, $cuenta]);
  } else {
    $stmt = $pdo->prepare('SELECT COALESCE(ROUND(SUM(subtotal),2),0) AS total FROM detalle_pedido WHERE id_pedido=?');
    $stmt->execute([$idPedido]);
  }
  return round((float)$stmt->fetch()['total'], 2);
}

/**
 * Close order if fully paid and all items are pagado.
 * Returns true if order was closed.
 */
function closeOrderIfPaid($pdo, $idPedido, $totalPedido) {
  $allPagos = $pdo->prepare('SELECT COALESCE(ROUND(SUM(monto),2),0) AS t FROM pagos WHERE id_pedido=?');
  $allPagos->execute([$idPedido]);
  $totalPagado = round((float)$allPagos->fetch()['t'], 2);
  if ($totalPagado < round($totalPedido, 2) - 0.01) return false;

  $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
  $unpaid->execute([$idPedido]);
  if ((int)$unpaid->fetch()['c'] > 0) return false;

  $todosMetodos = $pdo->prepare('SELECT DISTINCT metodo_pago FROM pagos WHERE id_pedido=?');
  $todosMetodos->execute([$idPedido]);
  $metodos = implode(', ', array_column($todosMetodos->fetchAll(), 'metodo_pago'));
  $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $idPedido]);
  return true;
}

/**
 * Register sale in cash register.
 */
function registrarVentaEnCaja($pdo, $idPedido, $pagos, $desc, $userId) {
  $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
  if (!$caja) return;
  $stmt = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, id_pedido, usuario_id) VALUES (?,?,?,?,?,?,?,?)');
  foreach ($pagos as $p) {
    $stmt->execute([$caja['id'], 'VENTA', $p['metodoPago'], tipoPago($p['metodoPago']), $desc, $p['monto'], $idPedido, $userId]);
  }
}

/**
 * Register payments (simple bulk insert).
 */
function registrarPagos($pdo, $idPedido, $cuenta, $pagos, $userId) {
  $stmt = $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, usuario_id, mesa) SELECT ?,?,?,?,?,lugar FROM pedidos WHERE id_pedido=?');
  foreach ($pagos as $p) {
    $stmt->execute([$idPedido, $cuenta, $p['metodoPago'], round($p['monto'], 2), $userId, $idPedido]);
  }
}

/**
 * Parse pagos from body with validation (legacy format for cerrar endpoint).
 */
function parsePagos($body, $total) {
  if (!empty($body['pagos']) && is_array($body['pagos'])) {
    $pagos = array_map(fn($p) => ['metodoPago' => normalizarMetodoPago($p['metodoPago'] ?? ''), 'monto' => round((float)($p['monto'] ?? 0), 2)], $body['pagos']);
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
