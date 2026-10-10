<?php
require_once __DIR__ . '/../config.php';
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

// GET /api/recetas/costos — costo teórico por producto (v11)
// `costoTeorico` es lo que cuesta HACER una unidad según su receta
// (Σ recetas.cantidad × materia_prima.costo). `null` cuando no hay receta:
// ahí el costo válido es `costoCatalogo`, el que cargó el administrador.
if ($method === 'GET' && $path === 'recetas/costos') {
  $rows = db()->query("
    SELECT p.codigo, p.nombre, p.grupo, p.precio, p.costo AS costo_catalogo,
      (SELECT COUNT(*) FROM recetas r WHERE r.codigo_producto = p.codigo) AS lineas,
      (SELECT COALESCE(SUM(r.cantidad * mp.costo), 0)
         FROM recetas r JOIN materia_prima mp ON mp.codigo = r.codigo_materia_prima
        WHERE r.codigo_producto = p.codigo) AS costo_teorico
    FROM productos p
    ORDER BY p.nombre
  ")->fetchAll();

  $out = array_map(function ($r) {
    $lineas = (int)$r['lineas'];
    $teorico = $lineas > 0 ? round((float)$r['costo_teorico'], 2) : null;
    $costo = $teorico !== null ? $teorico : round((float)$r['costo_catalogo'], 2);
    $precio = round((float)$r['precio'], 2);
    $margen = round($precio - $costo, 2);
    return [
      'codigo' => $r['codigo'],
      'nombre' => $r['nombre'],
      'grupo' => $r['grupo'],
      'insumos' => $lineas,
      'costoTeorico' => $teorico,
      'costoCatalogo' => round((float)$r['costo_catalogo'], 2),
      'costoEfectivo' => $costo,
      'precio' => $precio,
      'margen' => $margen,
      // Margen sobre el precio de venta: lo que queda de cada $100 vendidos.
      'margenPct' => $precio > 0 ? round($margen / $precio * 100, 1) : null,
    ];
  }, $rows);
  jsonResponse($out);
}

// POST /api/recetas
if ($method === 'POST' && $path === 'recetas') {
  $v = validate($body, [
    'codigoProducto' => 'required|string|max:20',
    'codigoMateriaPrima' => 'required|string|max:20',
    // min 0.01 y no 0.001: `movimientos_materia_prima.cantidad` es
    // DECIMAL(12,2), igual que el resto del stock. Una receta de 0.001 por
    // unidad se redondearía a 0 al consumir y la materia prima nunca bajaría.
    'cantidad' => 'required|numeric|min:0.01',
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
  if (isset($body['cantidad'])) {
    // Igual que en el POST: sin este corte, un PUT con `cantidad: 0` creaba una
    // receta que existe pero no consume nada — materia prima que nunca baja.
    $cantidad = (float)$body['cantidad'];
    if ($cantidad < 0.01) jsonError('cantidad por debajo del mínimo (0.01): el stock de materia prima se lleva con 2 decimales', 422);
    $sets[] = 'cantidad=?';
    $vals[] = $cantidad;
  }
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
