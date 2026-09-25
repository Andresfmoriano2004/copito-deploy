<?php
// ─── GET /api/pedidos/{id} ─────────────────────────
if ($method === 'GET' && preg_match('#^pedidos/([^/]+)$#', $path, $m)) {
  $id = $m[1];
  $ped = fetchPedido($pdo, $id);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($ped, $authUser);

  $items = fetchPedidoItems($pdo, $id);
  $pagos = fetchPedidoPagos($pdo, $id);
  $totalPagado = round(array_sum(array_map(fn($p) => (float)$p['monto'], $pagos)), 2);

  jsonResponse([
    'id' => $ped['id_pedido'], 'lugar' => $ped['lugar'], 'cliente' => $ped['cliente'] ?? '',
    'notas' => $ped['notas'] ?? '', 'estado' => $ped['estado'],
    'fechaCreacion' => fmtFechaBogota($ped['fecha_creacion']),
    'horaCreacion' => fmtHoraBogota($ped['fecha_creacion']),
    'fechaHoraCreacion' => fmtFechaHoraBogota($ped['fecha_creacion']),
    'fechaCierre' => fmtFechaBogota($ped['fecha_cierre'] ?? null),
    'horaCierre' => fmtHoraBogota($ped['fecha_cierre'] ?? null),
    'fechaHoraCierre' => fmtFechaHoraBogota($ped['fecha_cierre'] ?? null),
    'vendedor' => $ped['vendedor'] ?? '',
    'total' => round((float)$ped['total'], 2), 'metodoPago' => $ped['metodo_pago'] ?? '',
    'totalPagado' => $totalPagado, 'saldoRestante' => round((float)$ped['total'] - $totalPagado, 2),
    'items' => $items, 'pagos' => $pagos,
    'cuentasActivas' => $ped['cuentas_activas'] ? explode(',', $ped['cuentas_activas']) : null
  ]);
}

// ─── GET /api/pedidos/{id}/cuentas ─────────────────
if ($method === 'GET' && preg_match('#^pedidos/(.+)/cuentas$#', $path, $m)) {
  $ped = fetchPedido($pdo, $m[1]);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($ped, $authUser);

  $stmt = $pdo->prepare('SELECT cuenta, COUNT(*) AS items, SUM(subtotal) AS total FROM detalle_pedido WHERE id_pedido=? AND cuenta IS NOT NULL GROUP BY cuenta');
  $stmt->execute([$m[1]]);
  jsonResponse(array_map(fn($r) => ['cuenta' => $r['cuenta'], 'items' => (int)$r['items'], 'total' => (float)$r['total']], $stmt->fetchAll()));
}

// ─── GET /api/pedidos/{id}/pagos ───────────────────
if ($method === 'GET' && preg_match('#^pedidos/(.+)/pagos$#', $path, $m)) {
  $ped = fetchPedido($pdo, $m[1]);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($ped, $authUser);

  $stmt = $pdo->prepare('SELECT * FROM pagos WHERE id_pedido=? ORDER BY id');
  $stmt->execute([$m[1]]);
  jsonResponse(array_map(fn($r) => [
    'id' => (int)$r['id'], 'cuenta' => $r['cuenta'] ?? null, 'metodoPago' => $r['metodo_pago'],
    'monto' => (float)$r['monto'], 'fecha' => $r['fecha']
  ], $stmt->fetchAll()));
}

// ─── GET /api/pedidos/{id}/pdf ─────────────────────
if ($method === 'GET' && preg_match('#^pedidos/([^/]+)/pdf$#', $path, $m)) {
  $id = $m[1];
  $ped = fetchPedido($pdo, $id);
  if (!$ped) jsonError('Pedido no encontrado', 404);
  autorizarAccesoPedido($ped, $authUser);
  $items = fetchPedidoItems($pdo, $id);
  $pagos = fetchPedidoPagos($pdo, $id);

  header('Content-Type: text/html; charset=utf-8');
  ?>
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Ticket Pedido #<?= htmlspecialchars($id) ?></title>
    <style>
      @page { margin: 0; size: 80mm auto; }
      body { font-family: 'Courier New', Courier, monospace; font-size: 12px; margin: 0; padding: 10px; background: #fff; color: #000; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      .flex { display: flex; justify-content: space-between; margin-bottom: 3px; }
      .hr { border-top: 1px dashed #333; margin: 8px 0; }
      .hr-double { border-top: 1px double #000; border-bottom: 1px double #000; height: 3px; margin: 8px 0; }
      .item { margin-bottom: 5px; }
      .btn-print { margin-bottom: 15px; padding: 8px 16px; background: #C2185B; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
      @media print { .no-print { display: none; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="text-align:center; padding: 10px;">
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir Ticket</button>
    </div>
    <div class="center">
      <div class="bold" style="font-size:16px;">DARK PINK COFFEE</div>
      <div style="font-size:11px;">Cafetería & Pastelería</div>
      <div style="font-size:10px;">NIT: 901.234.567-8</div>
      <div class="hr-double"></div>
      <div class="bold">*** FACTURA DE VENTA ***</div>
    </div>
    <div class="hr"></div>
    <div class="flex"><span>Pedido: <strong>#<?= htmlspecialchars($id) ?></strong></span><span><?= date('d/m/Y h:i A', strtotime($ped['fecha_cierre'] ?? $ped['fecha_creacion'])) ?></span></div>
    <div class="flex"><span>Lugar: <strong><?= htmlspecialchars($ped['lugar']) ?></strong></span></div>
    <?php if (!empty($ped['cliente'])): ?>
      <div class="flex"><span>Cliente: <strong><?= htmlspecialchars($ped['cliente']) ?></strong></span></div>
    <?php endif; ?>
    <div class="hr"></div>
    <div>
      <?php foreach ($items as $it): ?>
        <div class="item">
          <div class="flex">
            <span><?= (float)$it['cantidad'] ?>x <?= htmlspecialchars($it['nombre_producto']) ?></span>
            <span>$<?= number_format($it['subtotal'], 0, ',', '.') ?></span>
          </div>
          <?php if ($it['cantidad'] > 1): ?>
            <div style="font-size:10px;color:#555;">(<?= (float)$it['cantidad'] ?> x $<?= number_format($it['precio_unitario'], 0, ',', '.') ?>)</div>
          <?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
    <div class="hr"></div>
    <div class="flex bold" style="font-size:14px;">
      <span>TOTAL:</span>
      <span>$<?= number_format($ped['total'], 0, ',', '.') ?></span>
    </div>
    <?php if (!empty($ped['metodo_pago'])): ?>
      <div class="flex"><span>Pago:</span><span><?= htmlspecialchars($ped['metodo_pago']) ?></span></div>
    <?php endif; ?>
    <div class="center" style="margin-top:12px;">
      <div class="hr-double"></div>
      <div class="bold">¡Gracias por su visita!</div>
      <div>Vuelva pronto ☕</div>
    </div>
    <script>
      window.onload = function() { window.print(); }
    </script>
  </body>
  </html>
  <?php
  exit;
}