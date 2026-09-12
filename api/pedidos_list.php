<?php
// ─── GET /api/pedidos/activos ──────────────────────
if ($method === 'GET' && $path === 'pedidos/activos') {
  $rows = $pdo->query("SELECT p.id_pedido, p.lugar, p.cliente, p.estado, p.fecha_creacion, p.total,
      COALESCE((SELECT SUM(monto) FROM pagos WHERE id_pedido=p.id_pedido),0) AS total_pagado
    FROM pedidos p WHERE p.estado='Abierto' ORDER BY FIELD(p.lugar,'Barra 1','Barra 2','Barra 3','Sofá','Mesa 1','Mesa 2','Mesa 3','Mesa 4','Mesa 5')")->fetchAll();
  jsonResponse(array_map(fn($r) => [
    'id' => $r['id_pedido'], 'lugar' => $r['lugar'], 'cliente' => $r['cliente'] ?? '',
    'estado' => $r['estado'],
    'estadoMesa' => (float)$r['total'] > 0 && (float)($r['total_pagado'] ?? 0) >= (float)$r['total'] - 0.01 ? 'Pagada' : ((float)($r['total_pagado'] ?? 0) > 0 ? 'En pago' : 'Ocupada'),
    'fechaCreacion' => fmtFechaBogota($r['fecha_creacion']),
    'horaCreacion' => fmtHoraBogota($r['fecha_creacion']),
    'fechaHoraCreacion' => fmtFechaHoraBogota($r['fecha_creacion']),
    'fechaCreacionISO' => $r['fecha_creacion'],
    'total' => (float)$r['total'],
    'totalPagado' => (float)($r['total_pagado'] ?? 0),
    'saldo' => max(0, round((float)$r['total'] - (float)($r['total_pagado'] ?? 0), 2))
  ], $rows));
}

// ─── GET /api/pedidos/historial ────────────────────
// Fase 2: ?page= activa {data,total,page,limit}; legacy array con ?offset&limit.
if ($method === 'GET' && $path === 'pedidos/historial') {
  $pg = pageParams(100, 500);
  $where = '1=1'; $params = [];

  if ($authUser['rol'] === 'vendedor') { $where .= ' AND usuario_id=?'; $params[] = $authUser['id']; }
  if (!empty($_GET['fecha_desde'])) { $where .= ' AND fecha_creacion>=?'; $params[] = $_GET['fecha_desde']; }
  if (!empty($_GET['fecha_hasta'])) { $where .= ' AND fecha_creacion<=?'; $params[] = $_GET['fecha_hasta'] . ' 23:59:59'; }
  if (!empty($_GET['lugar'])) { $where .= ' AND lugar=?'; $params[] = $_GET['lugar']; }
  if (!empty($_GET['estado'])) { $where .= ' AND estado=?'; $params[] = $_GET['estado']; }

  $mapHist = fn($r) => [
    'id' => $r['id_pedido'], 'lugar' => $r['lugar'], 'cliente' => $r['cliente'] ?? '',
    'estado' => $r['estado'],
    'cancelacionMotivo' => $r['cancelacion_motivo'] ?? null,
    'fechaCreacion' => fmtFechaBogota($r['fecha_creacion']),
    'horaCreacion' => fmtHoraBogota($r['fecha_creacion']),
    'fechaHoraCreacion' => fmtFechaHoraBogota($r['fecha_creacion']),
    'fechaCierre' => fmtFechaBogota($r['fecha_cierre'] ?? null),
    'horaCierre' => fmtHoraBogota($r['fecha_cierre'] ?? null),
    'fechaHoraCierre' => fmtFechaHoraBogota($r['fecha_cierre'] ?? null),
    'total' => (float)$r['total'], 'metodoPago' => $r['metodo_pago'] ?? '',
    'vendedor' => $r['vendedor'] ?? ''
  ];
  if ($pg['hasPaging']) {
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM pedidos WHERE $where");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();
    $stmt = $pdo->prepare("SELECT id_pedido, lugar, cliente, estado, fecha_creacion, fecha_cierre, total, metodo_pago, vendedor, cancelacion_motivo FROM pedidos WHERE $where ORDER BY id_pedido DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}");
    $stmt->execute($params);
    pagedResponse(array_map($mapHist, $stmt->fetchAll()), $total, $pg['page'], $pg['limit']);
  }
  $offset = max(0, (int)($_GET['offset'] ?? 0));
  $limit = min(500, max(1, (int)($_GET['limit'] ?? 200)));

  $stmt = $pdo->prepare("SELECT id_pedido, lugar, cliente, estado, fecha_creacion, fecha_cierre, total, metodo_pago, vendedor, cancelacion_motivo FROM pedidos WHERE $where ORDER BY id_pedido DESC LIMIT $limit OFFSET $offset");
  $stmt->execute($params);
  jsonResponse(array_map($mapHist, $stmt->fetchAll()));
}