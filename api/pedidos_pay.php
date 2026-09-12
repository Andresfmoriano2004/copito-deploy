<?php
// ─── POST /api/pedidos/{id}/cerrar ─────────────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/cerrar$#', $path, $m)) {
  $id = $m[1];
  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está cerrado');

  $total = round((float)$pedRow['total'], 2);
  $pagos = parsePagos($body, $total);
  if (!$pagos) jsonError('Método(s) de pago requerido(s)');
  $totalPagado = round(array_sum(array_column($pagos, 'monto')), 2);
  if ($totalPagado < $total) jsonError("El total pagado ($" . number_format($totalPagado, 0, ',', '.') . ") es menor que el total ($" . number_format($total, 0, ',', '.') . ")");

  $pdo->beginTransaction();
  try {
    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    registrarPagos($pdo, $id, null, $pagos);
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id", $authUser['id']);

    $items = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=?');
    $items->execute([$id]);
    registrarMovimientosStock($pdo, $items->fetchAll(), "Pedido $id");

    $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
    $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO', $id, $pedRow['lugar'], ['monto' => $total, 'metodos' => $metodos]);
  } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => 'Pedido cerrado correctamente']);
}

// ─── POST /api/pedidos/{id}/cerrar-cuenta ──────────
if ($method === 'POST' && preg_match('#^pedidos/(.+)/cerrar-cuenta$#', $path, $m)) {
  $id = $m[1];
  $cuenta = $body['cuenta'] ?? null;

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow) jsonError('Pedido no encontrado', 404);
  if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está cerrado');
  if ($cuenta !== null && !validarCuentaPedido($pdo, $id, $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

  $pagos = $body['pagos'] ?? [];
  if (!is_array($pagos) || empty($pagos)) jsonError('Método(s) de pago requerido(s)');
  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    $p['monto'] = round((float)($p['monto'] ?? 0));
    if (!validarMetodoPago($p['metodoPago']) || $p['monto'] <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);
  $nuevo = round(array_sum(array_column($pagos, 'monto')), 2);

  $pdo->beginTransaction();
  try {
    // Lock pagos del pedido para evitar concurrent writes
    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    $sumStmt = $pdo->prepare('SELECT COALESCE(ROUND(SUM(subtotal),2),0) AS total FROM detalle_pedido WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL))');
    $sumStmt->execute([$id, $cuenta, $cuenta]);
    $totalCuenta = round((float)$sumStmt->fetch()['total'], 2);

    if ($nuevo < $totalCuenta) { $pdo->rollBack(); jsonError("Total pagado ($" . number_format($nuevo, 0, ',', '.') . ") menor que total de cuenta ($" . number_format($totalCuenta, 0, ',', '.') . ")"); }

    registrarPagos($pdo, $id, $cuenta, $pagos);
    $descCuenta = $cuenta ?: 'General';
    registrarVentaEnCaja($pdo, $id, $pagos, "Cuenta $descCuenta de $id", $authUser['id']);

    $items = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? AND (cuenta=? OR (cuenta IS NULL AND ? IS NULL))');
    $items->execute([$id, $cuenta, $cuenta]);
    $soloPend = array_values(array_filter($items->fetchAll(), fn($i) => !$i['pagado']));
    if ($soloPend) registrarMovimientosStock($pdo, $soloPend, "Pedido $id (Cuenta $descCuenta)");

    $allPagos = $pdo->prepare('SELECT COALESCE(ROUND(SUM(monto),2),0) AS total FROM pagos WHERE id_pedido=?');
    $allPagos->execute([$id]);
    if (round((float)$allPagos->fetch()['total'], 2) >= round((float)$pedRow['total'], 2)) {
      $todosMetodos = $pdo->prepare('SELECT DISTINCT metodo_pago FROM pagos WHERE id_pedido=?');
      $todosMetodos->execute([$id]);
      $metodos = implode(', ', array_column($todosMetodos->fetchAll(), 'metodo_pago'));
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    }
    $pdo->commit();
  } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => "Cuenta $descCuenta cerrada por $ " . number_format($totalCuenta, 0, ',', '.')]);
}

  // ─── POST /api/pedidos/{id}/abonar ─────────────────
  // Pagos parciales ILIMITADOS que se acumulan: Total = Acumulado + Pendiente.
  // Cierra la cuenta (items→pagados + salida de stock) y el pedido al llegar a $0.
  // Nunca permite superar el total del alcance (cuenta o pedido).
  // Validación de saldo DENTRO de transacción con FOR UPDATE para evitar race condition.
  if ($method === 'POST' && preg_match('#^pedidos/(.+)/abonar$#', $path, $m)) {
    $id = $m[1];
    $cuenta = $body['cuenta'] ?? null;
    if ($cuenta === '') $cuenta = null;
    $pagos = $body['pagos'] ?? [];
    if (!is_array($pagos) || empty($pagos)) jsonError('pagos requeridos');

    $pedRow = fetchPedido($pdo, $id);
    if (!$pedRow) jsonError('Pedido no encontrado', 404);
    if ($pedRow['estado'] !== 'Abierto') jsonError('El pedido ya está ' . $pedRow['estado'], 409);
    if ($cuenta !== null && !validarCuentaPedido($pdo, $id, $cuenta)) jsonError("La cuenta '$cuenta' no es válida para este pedido");

    foreach ($pagos as &$p) {
      $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
      $p['monto'] = round((float)($p['monto'] ?? 0));
      if (!validarMetodoPago($p['metodoPago']) || $p['monto'] <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
    }
    unset($p);
    $nuevo = round(array_sum(array_column($pagos, 'monto')), 2);

    $pdo->beginTransaction();
    try {
      // Lock pagos del pedido para evitar concurrent writes (race condition)
      $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
      $lockStmt->execute([$id]);
      $lockStmt->fetchAll(); // consume result to hold lock

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
      $scopeTotal = round(array_sum(array_map(fn($i) => (float)$i['subtotal'], $scopeItems)), 2);

      // Ya acumulado: pagos directos a la cuenta + pagos por item vinculado a ella
      // Ahora DENTRO de la transacción con filas bloqueadas
      $ph = implode(',', array_fill(0, count($scopeIds), '?'));
      if ($cuenta !== null) {
        $pgStmt = $pdo->prepare("SELECT COALESCE(ROUND(SUM(monto),2),0) AS t FROM pagos WHERE id_pedido=? AND (cuenta=? OR detalle_id IN ($ph))");
        $pgStmt->execute(array_merge([$id, $cuenta], $scopeIds));
      } else {
        $pgStmt = $pdo->prepare('SELECT COALESCE(ROUND(SUM(monto),2),0) AS t FROM pagos WHERE id_pedido=?');
        $pgStmt->execute([$id]);
      }
      $previo = round((float)$pgStmt->fetch()['t'], 2);
      if ($previo >= $scopeTotal - 0.01) { $pdo->rollBack(); jsonError('Este alcance ya está pagado', 409); }
      if ($previo + $nuevo > $scopeTotal + 0.01) { $pdo->rollBack(); jsonError('Supera el saldo pendiente de $' . number_format(round($scopeTotal - $previo, 2), 0, ',', '.')); }
      $acumulado = round($previo + $nuevo, 2);
      $pendiente = round(max(0, $scopeTotal - $acumulado), 2);
      $cuentaCerrada = $pendiente <= 0.01;

      $ins = $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, usuario_id, mesa) VALUES (?,?,?,?,?,?)');
      foreach ($pagos as $p) $ins->execute([$id, $cuenta, $p['metodoPago'], $p['monto'], $authUser['id'], $pedRow['lugar']]);
      registrarVentaEnCaja($pdo, $id, $pagos, $cuenta ? "Abono Cuenta $cuenta de $id" : "Abono de $id", $authUser['id']);

      // Al completar la cuenta: items→pagados + salida de stock
      if ($cuentaCerrada) {
        $soloPend = array_values(array_filter($scopeItems, fn($i) => !$i['pagado']));
        if ($soloPend) registrarMovimientosStock($pdo, $soloPend, $cuenta ? "Pedido $id (Cuenta $cuenta)" : "Pedido $id");
      }
      // Cierre automático del pedido cuando todo queda en $0
      $allPagos = $pdo->prepare('SELECT COALESCE(ROUND(SUM(monto),2),0) AS t FROM pagos WHERE id_pedido=?');
      $allPagos->execute([$id]);
      $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
      $unpaid->execute([$id]);
      $pedidoCerrado = false;
      if (round((float)$allPagos->fetch()['t'], 2) >= round((float)$pedRow['total'], 2) - 0.01 && (int)$unpaid->fetch()['c'] === 0) {
        $todosMetodos = $pdo->prepare('SELECT DISTINCT metodo_pago FROM pagos WHERE id_pedido=?');
        $todosMetodos->execute([$id]);
        $metodosTodos = implode(', ', array_column($todosMetodos->fetchAll(), 'metodo_pago'));
        $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodosTodos, $id]);
        $pedidoCerrado = true;
      }
      $pdo->commit();
      auditLog($authUser, 'ABONO_PEDIDO', $id, $pedRow['lugar'], ['cuenta' => $cuenta, 'monto' => $nuevo, 'acumulado' => $acumulado, 'pendiente' => $pendiente]);
    } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError($e->getMessage(), 500); }

    jsonResponse(['success' => true,
      'mensaje' => $pedidoCerrado ? 'Cuenta pagada por completo. Pedido cerrado.' : ($cuentaCerrada ? 'Cuenta pagada por completo.' : 'Abono registrado.'),
      'acumulado' => $acumulado, 'pendiente' => $pendiente,
      'cuentaCerrada' => $cuentaCerrada, 'pedidoCerrado' => $pedidoCerrado]);
  }

// ─── POST /api/pedidos/{id}/pagar-item ─────────────
// Paga un solo item. Asocia el pago con la cuenta del item automáticamente.
if ($method === 'POST' && preg_match('#^pedidos/(.+)/pagar-item$#', $path, $m)) {
  $id = $m[1];
  $detalleId = (int)($body['detalleId'] ?? 0);
  $pagos = $body['pagos'] ?? [];
  $cambio = round((float)($body['cambio'] ?? 0), 2);
  if (!$detalleId || empty($pagos)) jsonError('detalleId y pagos requeridos');

  $pedRow = fetchPedido($pdo, $id);
  if (!$pedRow || $pedRow['estado'] !== 'Abierto') jsonError('Pedido no encontrado o cerrado');

  $itemStmt = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id=? AND id_pedido=?');
  $itemStmt->execute([$detalleId, $id]);
  $item = $itemStmt->fetch();
  if (!$item) jsonError('Item no encontrado');
  if ($item['pagado']) jsonError('El item ya fue pagado', 409);
  $itemTotal = round((float)$item['subtotal'], 2);
  $cuentaItem = $item['cuenta'] ?? null;

  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    $p['monto'] = round((float)($p['monto'] ?? 0));
    if (!validarMetodoPago($p['metodoPago']) || $p['monto'] <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);

  $totalPagado = round(array_sum(array_column($pagos, 'monto')), 2);
  if ($totalPagado < $itemTotal) jsonError("El total pagado ($" . number_format($totalPagado, 0, ',', '.') . ") es menor que el valor del item ($" . number_format($itemTotal, 0, ',', '.') . ")");
  if ($totalPagado > $itemTotal + 0.01) jsonError('El valor pagado no puede superar el item');

  $pdo->beginTransaction();
  try {
    $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
    foreach ($pagos as $p) {
      $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, notas, detalle_id, usuario_id, mesa) VALUES (?,?,?,?,?,?,?,?)')
           ->execute([$id, $cuentaItem, $p['metodoPago'], $p['monto'], "Item #$detalleId: " . $item['nombre_producto'], $detalleId, $authUser['id'], $pedRow['lugar']]);
    }
    $descCuenta = $cuentaItem ? " (Cuenta $cuentaItem)" : '';
    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id - Item #$detalleId$descCuenta", $authUser['id']);
    $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
         ->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], "Pedido $id - Item #$detalleId$descCuenta", $authUser['id']]);
    $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?')->execute([$detalleId]);

    $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
    $unpaid->execute([$id]);
    if ((int)$unpaid->fetch()['c'] === 0) {
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    }
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO_ITEM', $id, $pedRow['lugar'], ['detalleId' => $detalleId, 'monto' => $itemTotal, 'cuenta' => $cuentaItem]);
  } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => 'Item pagado']);
}

// ─── POST /api/pedidos/{id}/pagar-items ────────────
// Paga uno o más items individuales. Opcionalmente asocia el pago a una cuenta.
// Valida que todos los items pertenezcan a la misma cuenta (si se especifica).
if ($method === 'POST' && preg_match('#^pedidos/(.+)/pagar-items$#', $path, $m)) {
  $id = $m[1];
  $detalleIds = $body['detalleIds'] ?? [];
  $pagos = $body['pagos'] ?? [];
  $cuenta = $body['cuenta'] ?? null;
  if ($cuenta === '') $cuenta = null;
  $cambio = round((float)($body['cambio'] ?? 0), 2);
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

  // Validar que ningún item esté ya pagado
  foreach ($items as $item) if ($item['pagado']) jsonError("El item '{$item['nombre_producto']}' ya fue pagado", 409);

  // Validar que todos los items pertenezcan a la misma cuenta (si se especifica)
  if ($cuenta !== null) {
    $cuentasEnItems = array_unique(array_map(fn($i) => $i['cuenta'] ?? null, $items));
    if (count($cuentasEnItems) > 1 || ($cuentasEnItems[0] !== null && $cuentasEnItems[0] !== $cuenta)) {
      jsonError('Los items seleccionados no pertenecen todos a la cuenta ' . $cuenta);
    }
  }

  foreach ($pagos as &$p) {
    $p['metodoPago'] = normalizarMetodoPago($p['metodoPago'] ?? '');
    $p['monto'] = round((float)($p['monto'] ?? 0));
    if (!validarMetodoPago($p['metodoPago']) || $p['monto'] <= 0) jsonError('Método de pago o monto inválido. Use Efectivo o Transferencia');
  }
  unset($p);

  $totalItems = round(array_sum(array_map(fn($i) => (float)$i['subtotal'], $items)), 2);
  $totalPagado = round(array_sum(array_column($pagos, 'monto')), 2);
  if ($totalPagado < $totalItems) jsonError("Total pagado ($" . number_format($totalPagado, 0, ',', '.') . ") menor que valor de items ($" . number_format($totalItems, 0, ',', '.') . ")");
  if ($totalPagado > $totalItems + 0.01) jsonError('El valor pagado no puede superar los items');

  // Determinar cuenta para taggear el pago (de item, de parámetro, o null)
  $cuentaPago = $cuenta ?? ($items[0]['cuenta'] ?? null);

  $metodos = implode(', ', array_map(fn($p) => $p['metodoPago'], $pagos));
  $pdo->beginTransaction();
  try {
    // Lock pagos para evitar race condition
    $lockStmt = $pdo->prepare('SELECT 1 FROM pagos WHERE id_pedido=? FOR UPDATE');
    $lockStmt->execute([$id]);
    $lockStmt->fetchAll();

    registrarVentaEnCaja($pdo, $id, $pagos, "Pedido $id - Items multiples" . ($cuentaPago ? " (Cuenta $cuentaPago)" : ''), $authUser['id']);
    foreach ($items as $item) {
      $itemAmount = round((float)$item['subtotal'], 2);
      $remaining = $itemAmount;
      foreach ($pagos as $paymentIndex => $p) {
        $amount = $paymentIndex === count($pagos) - 1 ? $remaining : min($p['monto'], $remaining);
        if ($amount <= 0) continue;
        $pdo->prepare('INSERT INTO pagos (id_pedido, cuenta, metodo_pago, monto, notas, detalle_id, usuario_id, mesa) VALUES (?,?,?,?,?,?,?,?)')
             ->execute([$id, $cuentaPago, $p['metodoPago'], round($amount, 2), "Item #{$item['id']}: {$item['nombre_producto']}", $item['id'], $authUser['id'], $pedRow['lugar']]);
        $remaining = round($remaining - $amount, 2);
      }
      $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
           ->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], "Pedido $id - Items múltiples" . ($cuentaPago ? " (Cuenta $cuentaPago)" : ''), $authUser['id']]);
      $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?')->execute([$item['id']]);
    }
    $unpaid = $pdo->prepare('SELECT COUNT(*) AS c FROM detalle_pedido WHERE id_pedido=? AND pagado=FALSE');
    $unpaid->execute([$id]);
    if ((int)$unpaid->fetch()['c'] === 0) {
      $pdo->prepare("UPDATE pedidos SET estado='Cerrado', fecha_cierre=NOW(), metodo_pago=? WHERE id_pedido=?")->execute([$metodos, $id]);
    }
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PAGO_ITEMS', $id, $pedRow['lugar'], ['detalleIds' => $detalleIds, 'monto' => $totalItems, 'cuenta' => $cuentaPago]);
  } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonError($e->getMessage(), 500); }

  jsonResponse(['success' => true, 'mensaje' => "Items pagados por $" . number_format($totalItems, 0, ',', '.')]);
}