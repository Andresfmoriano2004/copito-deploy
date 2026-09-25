<?php
// ─── POST /api/pedidos/{id}/pagar-item ─────────────
// Paga un solo item. Asocia el pago con la cuenta del item automáticamente.
if ($method === 'POST' && preg_match('#^pedidos/(.+)/pagar-item$#', $path, $m)) {
  $id = $m[1];
  $detalleId = (int)($body['detalleId'] ?? 0);
  $pagos = $body['pagos'] ?? [];
  if (!$detalleId || empty($pagos)) jsonError('detalleId y pagos requeridos');

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow || $pedRow['estado'] !== 'Abierto') jsonError('Pedido no encontrado o cerrado');
  autorizarAccesoPedido($pedRow, $authUser);

  $pdo->beginTransaction();
  try {
    $itemStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id=? AND id_pedido=? FOR UPDATE');
    $itemStmt->execute([$detalleId, $id]);
    $item = $itemStmt->fetch();
    if (!$item) { $pdo->rollBack(); jsonError('Item no encontrado'); }
    if ($item['pagado']) { $pdo->rollBack(); jsonError('El item ya fue pagado', 409); }
    $itemTotal = round((float)$item['subtotal'], 2);
    $cuentaItem = $item['cuenta'] ?? null;

    $pagos = parsePagosFromBody($pagos);
    $totalPagado = round(array_sum(array_column($pagos, 'monto')), 2);
    if ($totalPagado < $itemTotal) { $pdo->rollBack(); jsonError("El total pagado ($" . number_format($totalPagado, 0, ',', '.') . ") es menor que el valor del item ($" . number_format($itemTotal, 0, ',', '.') . ")"); }
    if ($totalPagado > $itemTotal + 0.01) { $pdo->rollBack(); jsonError('El valor pagado no puede superar el item'); }

    $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
    foreach ($pagos as $p) {
      $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, notas, detalle_id, usuario_id, mesa) VALUES (?,?,?,?,?,?,?,?)')
           ->execute([$id, $cuentaItem, $p['metodoPago'], $p['monto'], "Item #$detalleId: " . $item['nombre_producto'], $detalleId, $authUser['id'], $pedRow['lugar']]);
    }
    $descCuenta = $cuentaItem ? " (Cuenta $cuentaItem)" : '';
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id - Item #$detalleId$descCuenta", $authUser['id']);
    registrarStockSalida($pdo, $item['codigo_producto'], $item['cantidad'], "Pedido $id - Item #$detalleId$descCuenta", $authUser['id']);
    $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?')->execute([$detalleId]);

    closeOrderIfPaid($pdo, $id, $pedRow['total']);
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO_ITEM', $id, $pedRow['lugar'], ['detalleId' => $detalleId, 'monto' => $itemTotal, 'cuenta' => $cuentaItem]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error pagando item en pedido ' . $id . ': ' . $e->getMessage());
    jsonError('No se pudo procesar el pago del item: ' . $e->getMessage(), 500);
  }

  jsonResponse(['success' => true, 'mensaje' => 'Item pagado']);
}

// ─── POST /api/pedidos/{id}/pagar-items ────────────
// Paga uno o más items individuales. Opcionalmente asocia el pago a una cuenta.
if ($method === 'POST' && preg_match('#^pedidos/(.+)/pagar-items$#', $path, $m)) {
  $id = $m[1];
  $detalleIds = $body['detalleIds'] ?? [];
  $pagos = $body['pagos'] ?? [];
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;
  if (!is_array($detalleIds)) $detalleIds = [$detalleIds];
  if (!is_array($pagos)) $pagos = [];
  $detalleIds = array_values(array_filter(array_map('intval', $detalleIds), fn($v) => $v > 0));
  if (empty($detalleIds) || empty($pagos)) jsonError('detalleIds y pagos requeridos');

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow || $pedRow['estado'] !== 'Abierto') jsonError('Pedido no encontrado o cerrado');
  autorizarAccesoPedido($pedRow, $authUser);

  $placeholders = implode(',', array_fill(0, count($detalleIds), '?'));
  $itemsStmt = $pdo->prepare("SELECT * FROM detalle_pedido WHERE id IN ($placeholders) AND id_pedido=?");
  $itemsStmt->execute(array_merge($detalleIds, [$id]));
  $items = $itemsStmt->fetchAll();
  if (empty($items)) jsonError('Items no encontrados');

  foreach ($items as $item) if ($item['pagado']) jsonError("El item '{$item['nombre_producto']}' ya fue pagado", 409);

  if ($cuenta !== null) {
    $cuentasEnItems = array_unique(array_map(fn($i) => $i['cuenta'] ?? null, $items));
    if (count($cuentasEnItems) > 1 || $cuentasEnItems[0] !== $cuenta) {
      jsonError('Los items seleccionados no pertenecen todos a la cuenta ' . $cuenta);
    }
  }

  $pagos = parsePagosFromBody($pagos);
  $totalItems = round(array_sum(array_map(fn($i) => (float)$i['subtotal'], $items)), 2);
  $totalPagado = round(array_sum(array_column($pagos, 'monto')), 2);
  if ($totalPagado < $totalItems) jsonError("Total pagado ($" . number_format($totalPagado, 0, ',', '.') . ") menor que valor de items ($" . number_format($totalItems, 0, ',', '.') . ")");
  if ($totalPagado > $totalItems + 0.01) jsonError('El valor pagado no puede superar los items');

  $cuentaPago = $cuenta ?? ($items[0]['cuenta'] ?? null);

  $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
  $pdo->beginTransaction();
  try {
    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id - Items multiples" . ($cuentaPago ? " (Cuenta $cuentaPago)" : ''), $authUser['id']);
    allocatePaymentsToItems($pdo, $id, $cuentaPago, $items, $totalItems, $pagos[0]['metodoPago'] ?? 'Efectivo', $authUser['id'], $pedRow['lugar']);
    foreach ($items as $item) {
      $descCuenta = $cuentaPago ? " (Cuenta $cuentaPago)" : '';
      registrarStockSalida($pdo, $item['codigo_producto'], $item['cantidad'], "Pedido $id - Item #{$item['id']}$descCuenta", $authUser['id']);
      $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?')->execute([$item['id']]);
    }

    closeOrderIfPaid($pdo, $id, $pedRow['total']);
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO_ITEMS', $id, $pedRow['lugar'], ['detalleIds' => $detalleIds, 'monto' => $totalItems, 'cuenta' => $cuentaPago]);
  } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => "Items pagados por $" . number_format($totalItems, 0, ',', '.')]);
}
