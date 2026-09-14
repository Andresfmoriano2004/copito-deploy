<?php
require_once __DIR__ . '/config.php';

$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$pdo = db();

// CSV con BOM y separador ";" (abre directo en Excel es-CO sin romper decimales).
function csvOut($filename, $headers, $rows) {
  http_response_code(200);
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="' . $filename . '"');
  echo "\xEF\xBB\xBF";
  $out = fopen('php://output', 'w');
  fputcsv($out, $headers, ';');
  foreach ($rows as $r) fputcsv($out, array_map(fn($v) => $v === null ? '' : (string)$v, $r), ';');
  fclose($out);
  exit;
}

// ─── GET /api/reportes/exportar-excel?tipo=movimientos|ventas|inventario ──
if ($method === 'GET' && $path === 'reportes/exportar-excel') {
  $tipo = $_GET['tipo'] ?? '';
  $desde = $_GET['desde'] ?? '';
  $hasta = $_GET['hasta'] ?? '';
  $sufijo = ($desde || $hasta) ? '_' . ($desde ?: 'ini') . '_' . ($hasta ?: 'hoy') : '_' . date('Y-m-d');
  // La auditoría nunca debe romper una exportación: si el INSERT falla,
  // se registra en el log y la descarga continúa.
  try {
    auditLog($authUser, 'EXPORTAR_EXCEL', null, null, ['tipo' => $tipo, 'desde' => $desde, 'hasta' => $hasta]);
  } catch (Throwable $e) {
    error_log('exportar-excel auditLog: ' . $e->getMessage());
  }

  try {

  if ($tipo === 'movimientos') {
    $where = '1=1'; $params = [];
    if ($desde) { $where .= ' AND m.fecha>=?'; $params[] = $desde; }
    if ($hasta) { $where .= ' AND m.fecha<=?'; $params[] = $hasta . ' 23:59:59'; }
    $stmt = $pdo->prepare("SELECT m.fecha, m.codigo_producto, p.nombre AS producto, m.tipo, m.cantidad, m.notas, u.nombre AS usuario
      FROM movimientos m LEFT JOIN productos p ON p.codigo=m.codigo_producto LEFT JOIN usuarios u ON u.id=m.usuario_id
      WHERE $where ORDER BY m.fecha DESC, m.id DESC");
    $stmt->execute($params);
    $rows = array_map(fn($r) => [$r['fecha'], $r['codigo_producto'], $r['producto'] ?? '', $r['tipo'], $r['cantidad'], $r['notas'] ?? '', $r['usuario'] ?? ''], $stmt->fetchAll());
    csvOut("movimientos$sufijo.csv", ['Fecha', 'Codigo', 'Producto', 'Tipo', 'Cantidad', 'Nota', 'Usuario'], $rows);
  }

  if ($tipo === 'ventas') {
    // Solo pedidos Cerrados: los Cancelados no son venta válida.
    $where = "p.estado='Cerrado'"; $params = [];
    if ($desde) { $where .= ' AND p.fecha_cierre>=?'; $params[] = $desde; }
    if ($hasta) { $where .= ' AND p.fecha_cierre<=?'; $params[] = $hasta . ' 23:59:59'; }
    $stmt = $pdo->prepare("SELECT p.fecha_cierre, p.id_pedido, p.lugar, p.cliente, p.vendedor, p.metodo_pago,
        d.codigo_producto, d.nombre_producto, d.cantidad, d.precio_unitario, d.subtotal
      FROM detalle_pedido d JOIN pedidos p ON p.id_pedido=d.id_pedido
      WHERE $where ORDER BY p.fecha_cierre DESC, p.id_pedido, d.id");
    $stmt->execute($params);
    $rows = array_map(fn($r) => [$r['fecha_cierre'], $r['id_pedido'], $r['lugar'], $r['cliente'] ?? '', $r['vendedor'] ?? '', $r['metodo_pago'] ?? '', $r['codigo_producto'], $r['nombre_producto'], $r['cantidad'], $r['precio_unitario'], $r['subtotal']], $stmt->fetchAll());
    csvOut("ventas$sufijo.csv", ['FechaCierre', 'Pedido', 'Lugar', 'Cliente', 'Vendedor', 'MetodoPago', 'Codigo', 'Producto', 'Cantidad', 'PrecioUnit', 'Subtotal'], $rows);
  }

  if ($tipo === 'inventario') {
    $rows = $pdo->query("SELECT p.codigo, p.nombre, p.unidad, p.grupo, p.stock_minimo, p.precio, p.costo,
        COALESCE((SELECT SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END) FROM movimientos WHERE codigo_producto=p.codigo),0) AS stock_actual
      FROM productos p ORDER BY p.nombre")->fetchAll();
    $rows = array_map(fn($r) => [$r['codigo'], $r['nombre'], $r['unidad'], $r['grupo'], $r['stock_actual'], $r['stock_minimo'], $r['precio'], $r['costo'], ((float)$r['stock_actual'] < (float)$r['stock_minimo']) ? 'BAJO' : 'OK'], $rows);
    csvOut('inventario_' . date('Y-m-d') . '.csv', ['Codigo', 'Nombre', 'Unidad', 'Grupo', 'Stock', 'Minimo', 'Precio', 'Costo', 'Estado'], $rows);
  }

  jsonError('Tipo inválido. Use movimientos, ventas o inventario');
  } catch (Throwable $e) {
    // Mensaje real solo para admin (ya autenticado); resto ve el genérico.
    error_log('exportar-excel: ' . $e->getMessage());
    if (($authUser['rol'] ?? '') === 'admin') jsonError('Exportación fallida: ' . $e->getMessage(), 500);
    jsonError('Error interno del servidor', 500);
  }
}

jsonError('Ruta no encontrada', 404);
