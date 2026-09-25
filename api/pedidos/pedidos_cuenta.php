<?php
// ─── POST /api/pedidos/{id}/cerrar-cuenta ──────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/cerrar-cuenta$#', $path, $m)) {
  $id = $m[1];
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($pedRow, $authUser);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está cerrado');
  if ($cuenta !== null && !validarCuentaPedido($pdo, $id, $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  $pagos = parsePagosFromBody($body['pagos'] ?? []);
  $nuevo = round(array_sum(array_column($pagos, 'monto')), 2);

  $pdo->beginTransaction();
  try {
    $pedRow = fetchPedido($pdo, $id);
    if (!$pedRow) { $pdo->rollBack(); jsonError('Pedido no encontrado', 404); }
    autorizarAccesoPedido($pedRow, $authUser);
    if ($pedRow['estado'] !== 'Abierto') { $pdo->rollBack(); jsonError('El pedido ya está cerrado'); }

    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    $totalCuenta = getScopeTotal($pdo, $id, $cuenta);
    $acumuladoPrevio = getPreviouslyPaid($pdo, $id, $cuenta);
    $totalConAbono = round($acumuladoPrevio + $nuevo, 2);
    if ($totalConAbono < $totalCuenta - 0.01) { $pdo->rollBack(); jsonError("Total pagado ($" . number_format($totalConAbono, 0, ',', '.') . ") menor que total de cuenta ($" . number_format($totalCuenta, 0, ',', '.') . ")"); }
    if ($totalConAbono > $totalCuenta + 0.01) { $pdo->rollBack(); jsonError("El pago ($" . number_format($nuevo, 0, ',', '.') . ") excede el saldo pendiente ($" . number_format(max(0, $totalCuenta - $acumuladoPrevio), 0, ',', '.') . ")"); }

    $pendientes = getUnpaidItems($pdo, $id, $cuenta);
    $metodoNotas = $pagos[0]['metodoPago'] ?? 'Efectivo';
    allocatePaymentsToItems($pdo, $id, $cuenta, $pendientes, $nuevo, $metodoNotas, $authUser['id'], $pedRow['lugar']);
    $descCuenta = $cuenta ?: 'General';
    registrarVentaEnCaja($pdo, $id, $pagos, "Cuenta $descCuenta de $id", $authUser['id']);

    $soloPend = getUnpaidItems($pdo, $id, $cuenta);
    if ($soloPend) registrarMovimientosStock($pdo, $soloPend, "Pedido $id (Cuenta $descCuenta)", $authUser['id']);

    closeOrderIfPaid($pdo, $id, $pedRow['total']);
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error cerrando cuenta en pedido ' . $id . ': ' . $e->getMessage());
    jsonError('No se pudo cerrar la cuenta: ' . $e->getMessage(), 500);
  }

  jsonResponse(['success' => true, 'mensaje' => "Cuenta $descCuenta cerrada por $ " . number_format($totalCuenta, 0, ',', '.')]);
}
