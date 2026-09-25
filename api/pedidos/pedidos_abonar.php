<?php
// ─── POST /api/pedidos/{id}/abonar ─────────────────
// Pagos parciales ILIMITADOS que se acumulan: Total = Acumulado + Pendiente.
// Cierra la cuenta (items→pagados + salida de stock) y el pedido al llegar a $0.
if ($method === 'POST' && preg_match('#^pedidos/(.+)/abonar$#', $path, $m)) {
  $id = $m[1];
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($pedRow, $authUser);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está ' . $pedRow['estado'], 409);
  if ($cuenta !== null && !validarCuentaPedido($pdo, $id, $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  $pagos = parsePagosFromBody($body['pagos'] ?? []);
  $nuevo = round(array_sum(array_column($pagos, 'monto')), 2);

  $pdo->beginTransaction();
  try {
    $pedRow = fetchPedido($pdo, $id);
    if (!$pedRow) { $pdo->rollBack(); jsonError('Pedido no encontrado', 404); }
    autorizarAccesoPedido($pedRow, $authUser);
    if ($pedRow['estado'] !== 'Abierto') { $pdo->rollBack(); jsonError('El pedido ya está ' . $pedRow['estado'], 409); }

    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    $scopeItems = getUnpaidItems($pdo, $id, $cuenta);
    if (empty($scopeItems)) {
      // Also try all items in scope (including paid ones) to check if already paid
      if ($cuenta !== null) {
        $allStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? AND cuenta=?');
        $allStmt->execute([$id, $cuenta]);
      } else {
        $allStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=?');
        $allStmt->execute([$id]);
      }
      $allItems = $allStmt->fetchAll();
      if (empty($allItems)) jsonError('No hay items en este alcance');
      $scopeItems = $allItems;
    }
    // Use getScopeTotal to sum ALL items (paid + unpaid) for correct balance
    $scopeTotal = getScopeTotal($pdo, $id, $cuenta);

    $previo = getPreviouslyPaid($pdo, $id, $cuenta);
    if ($previo >= $scopeTotal - 0.01) { $pdo->rollBack(); jsonError('Este alcance ya está pagado', 409); }
    if ($previo + $nuevo > $scopeTotal + 0.01) { $pdo->rollBack(); jsonError('Supera el saldo pendiente de $' . number_format(round($scopeTotal - $previo, 2), 0, ',', '.')); }
    $acumulado = round($previo + $nuevo, 2);
    $pendiente = round(max(0, $scopeTotal - $acumulado), 2);
    $cuentaCerrada = $pendiente <= 0.01;
    $soloPendientes = array_values(array_filter($scopeItems, fn($i) => !$i['pagado']));

    $metodoNotas = $pagos[0]['metodoPago'] ?? 'Efectivo';
    allocatePaymentsToItems($pdo, $id, $cuenta, $soloPendientes, $nuevo, $metodoNotas, $authUser['id'], $pedRow['lugar'], 'Abono');
    registrarVentaEnCaja($pdo, $id, $pagos, $cuenta ? "Abono Cuenta $cuenta de $id" : "Abono de $id", $authUser['id']);

    if ($cuentaCerrada && $soloPendientes) {
      registrarMovimientosStock($pdo, $soloPendientes, $cuenta ? "Pedido $id (Cuenta $cuenta)" : "Pedido $id", $authUser['id']);
    }

    $pedidoCerrado = closeOrderIfPaid($pdo, $id, $pedRow['total']);
    $pdo->commit();
    auditLog($authUser, 'ABONO_PEDIDO', $id, $pedRow['lugar'], ['cuenta' => $cuenta, 'monto' => $nuevo, 'acumulado' => $acumulado, 'pendiente' => $pendiente]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error registrando abono en pedido ' . $id . ': ' . $e->getMessage());
    jsonError('No se pudo registrar el abono: ' . $e->getMessage(), 500);
  }

  jsonResponse(['success' => true,
    'mensaje' => $pedidoCerrado ? 'Cuenta pagada por completo. Pedido cerrado.' : ($cuentaCerrada ? 'Cuenta pagada por completo.' : 'Abono registrado.'),
    'acumulado' => $acumulado, 'pendiente' => $pendiente,
    'cuentaCerrada' => $cuentaCerrada, 'pedidoCerrado' => $pedidoCerrado]);
}
