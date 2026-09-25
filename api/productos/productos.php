<?php
require_once __DIR__ . '/../config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';

// GET /api/productos - listar todos (?q= busca por código, nombre o grupo)
// Fase 2: ?page=&limit= activa {data,total,page,limit}; sin ellos, array legacy.
if ($method === 'GET' && $path === 'productos') {
  $q = trim($_GET['q'] ?? '');
  $pg = pageParams(50, 500);
  $where = '';
  $params = [];
  if ($q !== '') {
    $where = 'WHERE p.codigo LIKE ? OR p.nombre LIKE ? OR p.grupo LIKE ?';
    $like = '%' . $q . '%';
    $params = [$like, $like, $like];
  }
  $sqlBase = "
      SELECT p.*,
        " . getStockSubquery() . " AS stock_actual
      FROM productos p
      $where
      ORDER BY p.nombre";
  if ($pg['hasPaging']) {
    $totalStmt = db()->prepare("SELECT COUNT(*) FROM productos p $where");
    $totalStmt->execute($params);
    $total = (int)$totalStmt->fetchColumn();
    $stmt = db()->prepare("$sqlBase LIMIT {$pg['limit']} OFFSET {$pg['offset']}");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
  } elseif ($q !== '') {
    $stmt = db()->prepare("$sqlBase LIMIT 50");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
  } else {
    $rows = db()->query($sqlBase)->fetchAll();
  }
  $map = function($r) {
    return [
      'codigo' => $r['codigo'], 'nombre' => $r['nombre'], 'unidad' => $r['unidad'],
      'grupo' => $r['grupo'], 'stockMinimo' => (float)$r['stock_minimo'],
      'precio' => (float)$r['precio'], 'costo' => (float)$r['costo'], 'imagenUrl' => $r['imagen_url'] ?? null,
      'stockActual' => (float)$r['stock_actual']
    ];
  };
  if ($pg['hasPaging']) pagedResponse(array_map($map, $rows), $total, $pg['page'], $pg['limit']);
  jsonResponse(array_map($map, $rows));
}

// GET /api/productos/valoracion
if ($method === 'GET' && $path === 'productos/valoracion') {
  $rows = db()->query("
    SELECT p.codigo, p.nombre, p.costo,
      " . getStockSubquery() . " AS stock_actual
    FROM productos p ORDER BY p.nombre
  ")->fetchAll();
  $items = []; $total = 0;
  foreach ($rows as $r) {
    $stock = (float)$r['stock_actual'];
    $costo = (float)$r['costo'];
    $valor = $stock * $costo;
    $total += $valor;
    $items[] = ['nombre' => $r['nombre'], 'stockActual' => $stock, 'costo' => $costo, 'valorTotal' => $valor];
  }
  jsonResponse(['items' => $items, 'total' => $total]);
}

// GET /api/productos/{codigo}
if ($method === 'GET' && preg_match('#^productos/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  $stmt = db()->prepare("SELECT p.*, " . getStockSubquery() . " AS stock_actual FROM productos p WHERE p.codigo = ?");
  $stmt->execute([$codigo]);
  $r = $stmt->fetch();
  if (!$r) jsonError('Producto no encontrado', 404);
  jsonResponse([
    'codigo' => $r['codigo'], 'nombre' => $r['nombre'], 'unidad' => $r['unidad'],
    'grupo' => $r['grupo'], 'stockMinimo' => (float)$r['stock_minimo'],
    'precio' => (float)$r['precio'], 'costo' => (float)$r['costo'], 'imagenUrl' => $r['imagen_url'] ?? null,
    'stockActual' => (float)$r['stock_actual']
  ]);
}

// POST /api/productos - crear (Fase 3: validación central, mismo contrato)
if ($method === 'POST' && $path === 'productos') {
  $body = jsonBody();
  $codigo = trim($body['codigo'] ?? '');
  $nombre = trim($body['nombre'] ?? '');
  if (!$codigo || !$nombre) jsonError('Código y nombre requeridos');
  // Fase 3: endurece tipos/longitudes/rangos con validación central
  $v = validate($body, [
    'codigo' => 'string|max:20', 'nombre' => 'string|max:200',
    'unidad' => 'string|max:50', 'grupo' => 'string|max:100',
    'stockMinimo' => 'numeric|min:0', 'precio' => 'numeric|min:0',
    'costo' => 'numeric|min:0', 'stockInicial' => 'numeric|min:0',
  ]);
  $unidad = $v['unidad'] ?: 'Unidad'; $grupo = $v['grupo'] ?: '';
  $stockMinimo = (float)($v['stockMinimo'] ?? 0); $precio = round((float)($v['precio'] ?? 0));
  $costo = round((float)($v['costo'] ?? 0)); $stockInicial = (float)($v['stockInicial'] ?? 0);

  try {
    $stmt = db()->prepare('INSERT INTO productos (codigo, nombre, unidad, grupo, stock_minimo, precio, costo) VALUES (?,?,?,?,?,?,?)');
    $stmt->execute([$codigo, $nombre, $unidad, $grupo, $stockMinimo, $precio, $costo]);

    if ($stockInicial > 0) {
      $stmt2 = db()->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas) VALUES (?,?,?,?)');
      $stmt2->execute([$codigo, 'INGRESO', $stockInicial, 'Stock inicial']);
    }
    auditLog($authUser, 'CREAR_PRODUCTO', null, null, ['codigo' => $codigo]);
    jsonResponse(['success' => true, 'mensaje' => 'Producto registrado']);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('El código ya existe');
    serverError($e);
  }
}

// PUT /api/productos/{codigo} - actualizar
if ($method === 'PUT' && preg_match('#^productos/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  $body = jsonBody();
  $sets = []; $vals = [];
  foreach (['nombre', 'unidad', 'grupo'] as $f) {
    if (isset($body[$f])) { $sets[] = "$f=?"; $vals[] = $body[$f]; }
  }
  foreach (['stockMinimo' => 'stock_minimo', 'precio' => 'precio', 'costo' => 'costo'] as $js => $db) {
    if (isset($body[$js])) { $sets[] = "$db=?"; $vals[] = in_array($js, ['precio', 'costo'], true) ? round((float)$body[$js]) : (float)$body[$js]; }
  }
  if (!$sets) jsonError('Nada que actualizar');
  $vals[] = $codigo;
  $stmt = db()->prepare("UPDATE productos SET " . implode(',', $sets) . " WHERE codigo=?");
  $stmt->execute($vals);
  jsonResponse(['success' => true, 'mensaje' => 'Producto actualizado']);
}

// DELETE /api/productos/{codigo}
// Fase 4: con FK RESTRICT, si tiene movimientos/pedidos devuelve 409 (no 500).
if ($method === 'DELETE' && preg_match('#^productos/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  try {
    $stmt = db()->prepare('DELETE FROM productos WHERE codigo = ?');
    $stmt->execute([$codigo]);
    if ($stmt->rowCount() === 0) jsonError('Producto no encontrado', 404);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('No se puede eliminar: el producto tiene movimientos o ventas asociadas', 409);
    serverError($e);
  }
  jsonResponse(['success' => true, 'mensaje' => 'Producto eliminado']);
}

// POST /api/productos/{codigo}/imagen
if ($method === 'POST' && preg_match('#^productos/(.+)/imagen$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  if (empty($_FILES['imagen']) || $_FILES['imagen']['error'] !== UPLOAD_ERR_OK) jsonError('Imagen no recibida');
  $file = $_FILES['imagen'];
  if ($file['size'] > 2 * 1024 * 1024) jsonError('La imagen no puede superar 2 MB');
  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
  $extensiones = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
  if (!isset($extensiones[$mime])) jsonError('Formato no permitido. Use JPG, PNG o WEBP');
  $dir = dirname(__DIR__) . '/uploads/productos';
  if (!is_dir($dir) && !mkdir($dir, 0755, true)) jsonError('No se pudo preparar el almacenamiento', 500);
  $nombre = hash('sha256', $codigo . microtime(true)) . '.' . $extensiones[$mime];
  if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $nombre)) jsonError('No se pudo guardar la imagen', 500);
  // Relativa sin slash inicial: funciona en root (/) y subcarpeta (/copito-deploy/)
  $url = 'uploads/productos/' . $nombre;
  db()->prepare('UPDATE productos SET imagen_url=? WHERE codigo=?')->execute([$url, $codigo]);
  auditLog($authUser, 'SUBIR_IMAGEN_PRODUCTO', null, null, ['codigo' => $codigo]);
  jsonResponse(['success' => true, 'imagenUrl' => $url]);
}

jsonError('Ruta no encontrada', 404);
