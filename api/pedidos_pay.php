<?php
// ─── POST /api/pedidos/{id}/cerrar ─────────────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/cerrar$#', $path, $m)) {
  $id = $m[1];
  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está cerrado');

  $total = (float)$pedRow['total'];
  $pagos = parsePagos($body, $total);
  if (!$pagos) jsonError('Método(s) de pago requerido(s)');
  $totalPagado = array_sum(array_map(fn($p) => $p['monto'], $pagos));
  if ($totalPagado < $total) jsonError("El total pagado ($totalPagado) es menor que el total ($total)");

  $pdo->beginTransaction();
  try {
    registrarPagos($pdo, $id, null, $pagos);
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id", $authUser['id']);

    $items = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=?');
    $items->execute([$id]);
    registrarMovimientosStock($pdo, $items->fetchAll(), "Pedido $id");

    $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
    $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO', $id, $pedRow['lugar'], ['monto' => $total, 'metodos' => $metodos]);
  } catch (Exception $e) { $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => 'Pedido cerrado correctamente']);
}

// ─── POST /api/pedidos/{id}/cerrar-cuenta ──────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/cerrar-cuenta$#', $path, $m)) {
  $id = $m[1];
  $cuenta = $body['cuenta'] ?? null;

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está cerrado');

  $sumStmt = $pdo->prepare('SELECT COALESCE(SUM(subtotal),0) AS total FROM detalle_pedido WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL))');
  $sumStmt->execute([$id, $cuenta, $cuenta]);
  $totalCuenta = (float)$sumStmt->fetch()['total'];

  $pagos = parsePagos($body, $totalCuenta);
  if (!$pagos) jsonError('Método(s) de pago requerido(s)');
  $totalPagado = array_sum(array_map(fn($p) => $p['monto'], $pagos));
  if ($totalPagado < $totalCuenta) jsonError("Total pagado ($totalPagado) menor que total de cuenta ($totalCuenta)");

  $pdo->beginTransaction();
  try {
    registrarPagos($pdo, $id, $cuenta, $pagos);
    $descCuenta = $cuenta ?: 'General';
    registrarVentaEnCaja($pdo, $id, $pagos, "Cuenta $descCuenta de $id", $authUser['id']);

    $items = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL))');
    $items->execute([$id, $cuenta, $cuenta]);
    registrarMovimientosStock($pdo, $items->fetchAll(), "Pedido $id (Cuenta $cuenta)");

    $allPagos = $pdo->prepare('SELECT COALESCE(SUM(monto),0) AS total FROM pagos WHERE id_pedido=?');
    $allPagos->execute([$id]);
    if ((float)$allPagos->fetch()['total'] >= (float)$pedRow['total']) {
      $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    }
    $pdo->commit();
  } catch (Exception $e) { $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => "Cuenta $descCuenta cerrada por $ " . number_format($totalCuenta, 2)]);
}

// ─── POST /api/pedidos/{id}/abonar ─────────────────
// Pagos parciales ILIMITADOS que se acumulan: Total = Acumulado + Pendiente.
// Cierra la cuenta (items→pagados + salida de stock) y el pedido al llegar a $0.
// Nunca permite superar el total del alcance (cuenta o pedido).
if ($method === 'POST' && preg_match('#^pedidos/(.+)/abonar$#', $path, $m)) {
  $id = $m[1];
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;
  $pagos = $body['pagos'] ?? [];
  if (!is_array($pagos) || empty($pagos)) jsonError('pagos requeridos');

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está ' . $pedRow['estado'], 409);

  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    if (!validarMetodoPago($p['metodoPago']) || (float)($p['monto'] ?? 0) <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);
  $nuevo = array_sum(array_map(fn($p) => (float)$p['monto'], $pagos));

  // Alcance: cuenta específica o todo el pedido
  if ($cuenta !== null) {
    $itStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? AND cuenta=?');
    $itStmt->execute([$id, $cuenta]);
  } else {
    $itStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=?');
    $itStmt->execute([$id]);
  }
  $scopeItems = $itStmt->fetchAll();
  if (empty($scopeItems)) jsonError('No hay items en este alcance');
  $scopeIds = array_map(fn($i) => (int)$i['id'], $scopeItems);
  $scopeTotal = array_sum(array_map(fn($i) => (float)$i['subtotal'], $scopeItems));

  // Ya acumulado: pagos directos a la cuenta + pagos por item vinculado a ella
  $ph = implode(',', array_fill(0, count($scopeIds), '?'));
  if ($cuenta !== null) {
    $pgStmt = $pdo->prepare("SELECT COALESCE(SUM(monto),0) AS t FROM pagos WHERE id_pedido=? AND (cuenta=? OR detalle_id IN ($ph))");
    $pgStmt->execute(array_merge([$id, $cuenta], $scopeIds));
  } else {
    $pgStmt = $pdo->prepare('SELECT COALESCE(SUM(monto),0) AS t FROM pagos WHERE id_pedido=?');
    $pgStmt->execute([$id]);
  }
  $previo = (float)$pgStmt->fetch()['t'];
  if ($previo >= $scopeTotal - 0.01) jsonError('Este alcance ya está pagado', 409);
  if ($previo + $nuevo > $scopeTotal + 0.01) jsonError('Supera el saldo pendiente de ' . number_format($scopeTotal - $previo, 2));
  $acumulado = $previo + $nuevo;
  $pendiente = max(0, $scopeTotal - $acumulado);
  $cuentaCerrada = $pendiente <= 0.01;

  $metodos = implode(', ', array_unique(array_map(fn($p) => $p['metodoPago'], $pagos)));
  $pdo->beginTransaction();
  try {
    $ins = $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, usuario_id, mesa) VALUES (?,?,?,?,?,?)');
    foreach ($pagos as $p) $ins->execute([$id, $cuenta, $p['metodoPago'], (float)$p['monto'], $authUser['id'], $pedRow['lugar']]);
    registrarVentaEnCaja($pdo, $id, $pagos, $cuenta ? "Abono Cuenta $cuenta de $id" : "Abono de $id", $authUser['id']);

    // Al completar la cuenta: items→pagados + salida de stock
    if ($cuentaCerrada) {
      $soloPend = array_values(array_filter($scopeItems, fn($i) => !$i['pagado']));
      if ($soloPend) registrarMovimientosStock($pdo, $soloPend, $cuenta ? "Pedido $id (Cuenta $cuenta)" : "Pedido $id");
    }
    // Cierre automático del pedido cuando todo queda en $0
    $allPagos = $pdo->prepare('SELECT COALESCE(SUM(monto),0) AS t FROM pagos WHERE id_pedido=?');
    $allPagos->execute([$id]);
    $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
    $unpaid->execute([$id]);
    $pedidoCerrado = false;
    if ((float)$allPagos->fetch()['t'] >= (float)$pedRow['total'] - 0.01 && (int)$unpaid->fetch()['c'] === 0) {
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
      $pedidoCerrado = true;
    }
    $pdo->commit();
    auditLog($authUser, 'ABONO_PEDIDO', $id, $pedRow['lugar'], ['cuenta' => $cuenta, 'monto' => $nuevo, 'acumulado' => $acumulado, 'pendiente' => $pendiente]);
  } catch (Exception $e) { $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true,
    'mensaje' => $pedidoCerrado ? 'Cuenta pagada por completo. Pedido cerrado.' : ($cuentaCerrada ? 'Cuenta pagada por completo.' : 'Abono registrado.'),
    'acumulado' => $acumulado, 'pendiente' => $pendiente,
    'cuentaCerrada' => $cuentaCerrada, 'pedidoCerrado' => $pedidoCerrado]);
}

// ─── POST /api/pedidos/{id}/pagar-item ─────────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/pagar-item$#', $path, $m)) {
  $id = $m[1];
  $detalleId = (int)($body['detalleId'] ?? 0);
  $pagos = $body['pagos'] ?? [];
  $cambio = (float)($body['cambio'] ?? 0);
  if (!$detalleId || empty($pagos)) jsonError('detalleId y pagos requeridos');

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow || $pedRow['estado'] !== 'Abierto') jsonError('Pedido no encontrado o cerrado');

  $itemStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id=? AND id_pedido=?');
  $itemStmt->execute([$detalleId, $id]);
  $item = $itemStmt->fetch();
  if (!$item) jsonError('Item no encontrado');
  if ($item['pagado']) jsonError('El item ya fue pagado', 409);
  $itemTotal = (float)$item['subtotal'];

  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    if (!validarMetodoPago($p['metodoPago']) || (float)($p['monto'] ?? 0) <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);

  $totalPagado = array_sum(array_map(fn($p) => (float)$p['monto'], $pagos));
  if ($totalPagado < $itemTotal) jsonError("El total pagado ($totalPagado) es menor que el valor del item ($itemTotal)");
  if ($totalPagado > $itemTotal + 0.01) jsonError('El valor pagado no puede superar el item');

  $pdo->beginTransaction();
  try {
    $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
    foreach ($pagos as $p) {
      $pdo->prepare('INSERT INTO pagos (id_pedido, metodo_pago, monto, notas, detalle_id, usuario_id, mesa) VALUES (?,?,?,?,?,?,?)')->execute([$id, $p['metodoPago'], (float)$p['monto'], "Item #$detalleId: " . $item['nombre_producto'], $detalleId, $authUser['id'], $pedRow['lugar']]);
    }
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id - Item #$detalleId", $authUser['id']);
    $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], "Pedido $id - Item #$detalleId", $authUser['id']]);
    $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?')->execute([$detalleId]);

    $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
    $unpaid->execute([$id]);
    if ((int)$unpaid->fetch()['c'] === 0) {
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    }
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO_ITEM', $id, $pedRow['lugar'], ['detalleId' => $detalleId, 'monto' => $itemTotal]);
  } catch (Exception $e) { $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => 'Item pagado']);
}

// ─── POST /api/pedidos/{id}/pagar-items ────────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/pagar-items$#', $path, $m)) {
  $id = $m[1];
  $detalleIds = $body['detalleIds'] ?? [];
  $pagos = $body['pagos'] ?? [];
  $cambio = (float)($body['cambio'] ?? 0);
  // Aceptar un solo id suelto y sanear: evita TypeError (500) si llega malformado.
  if (!is_array($detalleIds)) $detalleIds = [$detalleIds];
  if (!is_array($pagos)) $pagos = [];
  $detalleIds = array_values(array_filter(array_map('intval', $detalleIds), fn($v) => $v > 0));
  if (empty($detalleIds) || empty($pagos)) jsonError('detalleIds y pagos requeridos');

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow || $pedRow['estado'] !== 'Abierto') jsonError('Pedido no encontrado o cerrado');

  $placeholders = implode(',', array_fill(0, count($detalleIds), '?'));
  $itemsStmt = $pdo->prepare("SELECT * FROM detalle_pedido WHERE id IN ($placeholders) AND id_pedido=?");
  $params = array_merge($detalleIds, [$id]);
  $itemsStmt->execute($params);
  $items = $itemsStmt->fetchAll();
  if (empty($items)) jsonError('Items no encontrados');
  foreach ($items as $item) if ($item['pagado']) jsonError('Uno de los items ya fue pagado', 409);
  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    if (!validarMetodoPago($p['metodoPago']) || (float)($p['monto'] ?? 0) <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);

  $totalItems = array_sum(array_map(fn($i) => (float)$i['subtotal'], $items));
  $totalPagado = array_sum(array_map(fn($p) => (float)$p['monto'], $pagos));
  if ($totalPagado < $totalItems) jsonError("Total pagado ($totalPagado) menor que valor de items ($totalItems)");
  if ($totalPagado > $totalItems + 0.01) jsonError('El valor pagado no puede superar los items');

  $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
  $pdo->beginTransaction();
  try {
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id - Items multiples", $authUser['id']);
    foreach ($items as $item) {
      $itemAmount = (float)$item['subtotal'];
      $remaining = $itemAmount;
      foreach ($pagos as $paymentIndex => $p) {
        $amount = $paymentIndex === count($pagos) - 1 ? $remaining : min((float)$p['monto'], $remaining);
        if ($amount <= 0) continue;
        $pdo->prepare('INSERT INTO pagos (id_pedido, metodo_pago, monto, notas, detalle_id, usuario_id, mesa) VALUES (?,?,?,?,?,?,?)')->execute([$id, $p['metodoPago'], $amount, "Item #{$item['id']}: {$item['nombre_producto']}", $item['id'], $authUser['id'], $pedRow['lugar']]);
        $remaining -= $amount;
      }
      $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], "Pedido $id - Items múltiples", $authUser['id']]);
      $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?')->execute([$item['id']]);
    }
    $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
    $unpaid->execute([$id]);
    if ((int)$unpaid->fetch()['c'] === 0) {
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    }
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO_ITEMS', $id, $pedRow['lugar'], ['detalleIds' => $detalleIds, 'monto' => $totalItems]);
  } catch (Exception $e) { $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => "Items pagados por $totalItems"]);
}