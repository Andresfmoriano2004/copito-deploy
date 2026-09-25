<?php
// ─── GET /api/dashboard/resumen ─────────────────────────────────────
// Fase 2: agregado en 1 sola petición HTTP para el Dashboard.
// Mismos formatos que /movimientos/stock + /pedidos/activos + /productos/valoracion.
require_once __DIR__ . '/../config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';

if ($method === 'GET' && $path === 'dashboard/resumen') {
  $pdo = db();
  $stock = $pdo->query("
    SELECT p.codigo, p.nombre, p.unidad, p.grupo, p.stock_minimo, p.precio, p.costo,
      " . getStockSubquery() . " AS stock_actual
    FROM productos p ORDER BY p.nombre
  ")->fetchAll();
  $stockMap = array_map(fn($r) => [
    'codigo' => $r['codigo'], 'nombre' => $r['nombre'], 'unidad' => $r['unidad'],
    'grupo' => $r['grupo'], 'stockMinimo' => (float)$r['stock_minimo'],
    'precio' => (float)$r['precio'], 'costo' => (float)$r['costo'],
    'stockActual' => (float)$r['stock_actual']
  ], $stock);

  $pedidosActivos = (int)$pdo->query("SELECT COUNT(*) FROM pedidos WHERE estado='Abierto'")->fetchColumn();

  $items = []; $total = 0;
  foreach ($stockMap as $p) {
    $valor = $p['stockActual'] * $p['costo'];
    $total += $valor;
    $items[] = ['nombre' => $p['nombre'], 'stockActual' => $p['stockActual'],
                'costo' => $p['costo'], 'valorTotal' => $valor];
  }

  jsonResponse([
    'stock' => $stockMap,
    'pedidosActivos' => $pedidosActivos,
    'valoracion' => ['items' => $items, 'total' => $total],
  ]);
}

jsonError('Ruta no encontrada', 404);
