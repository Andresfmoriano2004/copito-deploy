<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

// GET /api/recetas?producto=CodigoProducto
if ($method === 'GET' && $path === 'recetas') {
  $producto = trim($_GET['producto'] ?? '');
  if ($producto) {
    $stmt = db()->prepare("SELECT r.*, mp.nombre AS mp_nombre, mp.unidad AS mp_unidad, mp.stock_minimo AS mp_stock_minimo, mp.costo AS mp_costo
      FROM recetas r
      JOIN materia_prima mp ON r.codigo_materia_prima = mp.codigo
      WHERE r.codigo_producto = ?
      ORDER BY mp.nombre");
    $stmt->execute([$producto]);
  } else {
    $stmt = db()->prepare("SELECT r.*, p.nombre AS prod_nombre, mp.nombre AS mp_nombre, mp.unidad AS mp_unidad
      FROM recetas r
      JOIN productos p ON r.codigo_producto = p.codigo
      JOIN materia_prima mp ON r.codigo_materia_prima = mp.codigo
      ORDER BY p.nombre, mp.nombre");
    $stmt->execute();
  }
  $rows = $stmt->fetchAll();
  $map = fn($r) => [
    'id' => (int)$r['id'],
    'codigoProducto' => $r['codigo_producto'],
    'productoNombre' => $r['prod_nombre'] ?? $r['codigo_producto'],
    'codigoMateriaPrima' => $r['codigo_materia_prima'],
    'materiaPrimaNombre' => $r['mp_nombre'],
    'materiaPrimaUnidad' => $r['mp_unidad'],
    'cantidad' => (float)$r['cantidad'],
    'notas' => $r['notas'] ?? null,
    'mpStockMinimo' => isset($r['mp_stock_minimo']) ? (float)$r['mp_stock_minimo'] : null,
    'mpCosto' => isset($r['mp_costo']) ? (float)$r['mp_costo'] : null,
  ];
  jsonResponse(array_map($map, $rows));
}

// POST /api/recetas
if ($method === 'POST' && $path === 'recetas') {
  $v = validate($body, [
    'codigoProducto' => 'required|string|max:20',
    'codigoMateriaPrima' => 'required|string|max:20',
    'cantidad' => 'required|numeric|min:0.001',
    'notas' => 'string|max:500',
  ]);
  try {
    db()->prepare('INSERT INTO recetas (codigo_producto, codigo_materia_prima, cantidad, notas) VALUES (?,?,?,?)')
      ->execute([$v['codigoProducto'], $v['codigoMateriaPrima'], $v['cantidad'], $v['notas'] ?? null]);
    auditLog($authUser, 'CREAR_RECETA', null, null, ['producto' => $v['codigoProducto'], 'mp' => $v['codigoMateriaPrima']]);
    jsonResponse(['success' => true, 'mensaje' => 'Receta creada']);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('Ya existe una receta para esta materia prima en este producto');
    serverError($e);
  }
}

// PUT /api/recetas/{id}
if ($method === 'PUT' && preg_match('#^recetas/(.+)$#', $path, $m)) {
  $id = (int)$m[1];
  $body = jsonBody();
  $sets = [];
  $vals = [];
  if (isset($body['cantidad'])) { $sets[] = 'cantidad=?'; $vals[] = (float)$body['cantidad']; }
  if (isset($body['notas'])) { $sets[] = 'notas=?'; $vals[] = $body['notas']; }
  if (!$sets) jsonError('Nada que actualizar');
  $vals[] = $id;
  $stmt = db()->prepare("UPDATE recetas SET " . implode(',', $sets) . " WHERE id=?");
  $stmt->execute($vals);
  jsonResponse(['success' => true, 'mensaje' => 'Receta actualizada']);
}

// DELETE /api/recetas/{id}
if ($method === 'DELETE' && preg_match('#^recetas/(.+)$#', $path, $m)) {
  $id = (int)$m[1];
  $stmt = db()->prepare('DELETE FROM recetas WHERE id=?');
  $stmt->execute([$id]);
  if ($stmt->rowCount() === 0) jsonError('Receta no encontrada', 404);
  jsonResponse(['success' => true, 'mensaje' => 'Receta eliminada']);
}

jsonError('Ruta no encontrada', 404);
