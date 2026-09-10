<?php
// ─── GET /api/pedidos/ventas/reporte ───────────────
if ($method === 'GET' && $path === 'pedidos/ventas/reporte') {
  $where = "p.estado='Cerrado'"; $params = [];
  if (!empty($_GET['desde'])) { $where .= ' AND p.fecha_cierre>=?'; $params[] = $_GET['desde']; }
  if (!empty($_GET['hasta'])) { $where .= ' AND p.fecha_cierre<=?'; $params[] = $_GET['hasta'] . ' 23:59:59'; }
  $stmt = $pdo->prepare("SELECT d.codigo_producto AS codigo, d.nombre_producto AS nombre, SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS total FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE $where GROUP BY d.codigo_producto, d.nombre_producto ORDER BY total DESC");
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  $totalIngresos = array_sum(array_map(fn($r) => (float)$r['total'], $rows));
  jsonResponse([
    'productos' => array_map(fn($r) => ['codigo' => $r['codigo'], 'nombre' => $r['nombre'], 'cantidad' => (float)$r['cantidad'], 'total' => (float)$r['total']], $rows),
    'totalIngresos' => $totalIngresos,
    'sugeridoReinversion' => $totalIngresos * 0.9
  ]);
}

// ─── GET /api/pedidos/ventas/semanal ───────────────
if ($method === 'GET' && $path === 'pedidos/ventas/semanal') {
  $where = "p.estado='Cerrado'"; $params = [];
  if (!empty($_GET['desde'])) { $where .= ' AND p.fecha_cierre>=?'; $params[] = $_GET['desde']; }
  if (!empty($_GET['hasta'])) { $where .= ' AND p.fecha_cierre<=?'; $params[] = $_GET['hasta'] . ' 23:59:59'; }
  $stmt = $pdo->prepare("SELECT YEARWEEK(p.fecha_cierre,1) AS yearweek, d.codigo_producto AS codigo, d.nombre_producto AS nombre, SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS total FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido WHERE $where GROUP BY yearweek, d.codigo_producto, d.nombre_producto ORDER BY yearweek ASC, total DESC");
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  $semanas = [];
  foreach ($rows as $r) {
    $yw = $r['yearweek'];
    if (!isset($semanas[$yw])) {
      $year = (int)floor($yw / 100); $week = $yw % 100;
      $semanas[$yw] = ['semana' => "$year-W" . str_pad($week, 2, '0', STR_PAD_LEFT), 'inicio' => '', 'fin' => '', 'total' => 0, 'productos' => []];
    }
    $s = &$semanas[$yw];
    $s['total'] += (float)$r['total'];
    $s['productos'][] = ['codigo' => $r['codigo'], 'nombre' => $r['nombre'], 'cantidad' => (float)$r['cantidad'], 'total' => (float)$r['total']];
    unset($s);
  }
  jsonResponse(['semanas' => array_values($semanas)]);
}