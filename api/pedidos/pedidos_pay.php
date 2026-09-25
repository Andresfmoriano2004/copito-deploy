<?php
// ─── POST /api/pedidos/{id}/cerrar ─────────────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/cerrar$#', $path, $m)) {
  $id = $m[1];

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($pedRow, $authUser);

  $total = round((float)($pedRow['total'] ?? 0), 2);
  if ($total <= 0) jsonError('El total del pedido no es válido', 400);
  $pagos = parsePagos($body, $total);
  if (!$pagos) jsonError('Método(s) de pago requerido(s)');
  $nuevoPago = round(array_sum(array_column($pagos, 'monto')), 2);

  $pdo->beginTransaction();
  try {
    $pedRow = fetchPedido($pdo, $id);
    if (!$pedRow) { $pdo->rollBack(); jsonError('Pedido no encontrado', 404); }
    autorizarAccesoPedido($pedRow, $authUser);
    if ($pedRow['estado'] !== 'Abierto') { $pdo->rollBack(); jsonError('El pedido ya está cerrado'); }

    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    $previo = getPreviouslyPaid($pdo, $id);
    $totalConPago = round($previo + $nuevoPago, 2);
    if ($totalConPago < $total - 0.01) { $pdo->rollBack(); jsonError("El total pagado ($" . number_format($totalConPago, 0, ',', '.') . ") es menor que el total ($" . number_format($total, 0, ',', '.') . ")"); }

    $soloPend = getUnpaidItems($pdo, $id);
    $metodoNotas = $pagos[0]['metodoPago'] ?? 'Efectivo';
    allocatePaymentsToItems($pdo, $id, null, $soloPend, $nuevoPago, $metodoNotas, $authUser['id'], $pedRow['lugar']);
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id", $authUser['id']);

    if ($soloPend) registrarMovimientosStock($pdo, $soloPend, "Pedido $id", $authUser['id']);

    $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
    $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO', $id, $pedRow['lugar'], ['monto' => $total, 'metodos' => $metodos]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error cerrando pedido ' . $id . ': ' . $e->getMessage());
    jsonError('No se pudo cerrar el pedido: ' . $e->getMessage(), 500);
  }

  jsonResponse(['success' => true, 'mensaje' => 'Pedido cerrado correctamente']);
}
