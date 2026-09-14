<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

// GET /api/materia-prima
if ($method === 'GET' && $path === 'materia-prima') {
  $q = trim($_GET['q'] ?? '');
  $where = '';
  $params = [];
  if ($q !== '') {
    $where = 'WHERE mp.codigo LIKE ? OR mp.nombre LIKE ?';
    $like = '%' . $q . '%';
    $params = [$like, $like];
  }
  $sql = "SELECT mp.*,
    COALESCE((SELECT ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2)
              FROM movimientos_materia_prima WHERE codigo_materia_prima = mp.codigo), 0) AS stock_actual
    FROM materia_prima mp
    $where
    ORDER BY mp.nombre";
  $stmt = db()->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  $map = fn($r) => [
    'id' => (int)$r['id'], 'codigo' => $r['codigo'], 'nombre' => $r['nombre'],
    'unidad' => $r['unidad'], 'stockMinimo' => (float)$r['stock_minimo'],
    'costo' => (float)$r['costo'], 'stockActual' => (float)$r['stock_actual']
  ];
  jsonResponse(array_map($map, $rows));
}

// GET /api/materia-prima/{codigo}
if ($method === 'GET' && preg_match('#^materia-prima/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  $stmt = db()->prepare("SELECT mp.*,
    COALESCE((SELECT ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2)
              FROM movimientos_materia_prima WHERE codigo_materia_prima = mp.codigo), 0) AS stock_actual
    FROM materia_prima mp WHERE mp.codigo = ?");
  $stmt->execute([$codigo]);
  $r = $stmt->fetch();
  if (!$r) jsonError('Materia prima no encontrada', 404);
  jsonResponse([
    'id' => (int)$r['id'], 'codigo' => $r['codigo'], 'nombre' => $r['nombre'],
    'unidad' => $r['unidad'], 'stockMinimo' => (float)$r['stock_minimo'],
    'costo' => (float)$r['costo'], 'stockActual' => (float)$r['stock_actual']
  ]);
}

// POST /api/materia-prima
if ($method === 'POST' && $path === 'materia-prima') {
  $v = validate($body, [
    'codigo' => 'required|string|max:20',
    'nombre' => 'required|string|max:200',
    'unidad' => 'required|string|max:50',
    'stockMinimo' => 'numeric|min:0',
    'costo' => 'numeric|min:0',
  ]);
  try {
    db()->prepare('INSERT INTO materia_prima (codigo, nombre, unidad, stock_minimo, costo) VALUES (?,?,?,?,?)')
      ->execute([$v['codigo'], $v['nombre'], $v['unidad'], (float)($v['stockMinimo'] ?? 0), round((float)($v['costo'] ?? 0))]);
    auditLog($authUser, 'CREAR_MATERIA_PRIMA', null, null, ['codigo' => $v['codigo']]);
    jsonResponse(['success' => true, 'mensaje' => 'Materia prima creada']);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('El código ya existe');
    serverError($e);
  }
}

// PUT /api/materia-prima/{codigo}
if ($method === 'PUT' && preg_match('#^materia-prima/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  $body = jsonBody();
  $sets = [];
  $vals = [];
  foreach (['nombre' => 'nombre', 'unidad' => 'unidad'] as $js => $db) {
    if (isset($body[$js])) { $sets[] = "$db=?"; $vals[] = $body[$js]; }
  }
  if (isset($body['stockMinimo'])) { $sets[] = 'stock_minimo=?'; $vals[] = (float)$body['stockMinimo']; }
  if (isset($body['costo'])) { $sets[] = 'costo=?'; $vals[] = round((float)$body['costo']); }
  if (!$sets) jsonError('Nada que actualizar');
  $vals[] = $codigo;
  $stmt = db()->prepare("UPDATE materia_prima SET " . implode(',', $sets) . " WHERE codigo=?");
  $stmt->execute($vals);
  jsonResponse(['success' => true, 'mensaje' => 'Materia prima actualizada']);
}

// DELETE /api/materia-prima/{codigo}
if ($method === 'DELETE' && preg_match('#^materia-prima/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  try {
    $stmt = db()->prepare('DELETE FROM materia_prima WHERE codigo = ?');
    $stmt->execute([$codigo]);
    if ($stmt->rowCount() === 0) jsonError('Materia prima no encontrada', 404);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('No se puede eliminar: tiene movimientos o recetas asociadas', 409);
    serverError($e);
  }
  jsonResponse(['success' => true, 'mensaje' => 'Materia prima eliminada']);
}

// POST /api/materia-prima/movimiento
if ($method === 'POST' && $path === 'materia-prima/movimiento') {
  $v = validate($body, [
    'codigo' => 'required|string|max:20',
    'tipo' => 'required|in:INGRESO,SALIDA',
    'cantidad' => 'required|numeric|min:0.01',
    'notas' => 'string|max:500',
  ]);

  $pdo = db();
  $pdo->beginTransaction();
  try {
    // Bloquear registro de materia prima para evitar race conditions
    $lock = $pdo->prepare('SELECT codigo FROM materia_prima WHERE codigo=? FOR UPDATE');
    $lock->execute([$v['codigo']]);
    if (!$lock->fetch()) {
      $pdo->rollBack();
      jsonError('Materia prima no encontrada', 404);
    }

    // Verificar stock suficiente para salidas
    if ($v['tipo'] === 'SALIDA') {
      $stk = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0) AS t FROM movimientos_materia_prima WHERE codigo_materia_prima=?");
      $stk->execute([$v['codigo']]);
      $actual = (float)$stk->fetch()['t'];
      if ($v['cantidad'] > $actual + 0.01) {
        $pdo->rollBack();
        jsonError("Stock insuficiente. Disponible: $actual");
      }
    }

    $pdo->prepare('INSERT INTO movimientos_materia_prima (codigo_materia_prima, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
      ->execute([$v['codigo'], $v['tipo'], $v['cantidad'], $v['notas'] ?? null, (int)$authUser['id']]);
    $pdo->commit();
    auditLog($authUser, 'MOVIMIENTO_MATERIA_PRIMA', null, null, ['codigo' => $v['codigo'], 'tipo' => $v['tipo'], 'cantidad' => $v['cantidad']]);
    jsonResponse(['success' => true, 'mensaje' => 'Movimiento registrado']);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Error en movimiento materia prima: ' . $e->getMessage());
    jsonError('Error interno al registrar movimiento', 500);
  }
}

// GET /api/materia-prima/historial/{codigo}
if ($method === 'GET' && preg_match('#^materia-prima/historial/(.+)$#', $path, $m)) {
  $codigo = urldecode($m[1]);
  $rows = db()->prepare("SELECT m.*, u.nombre AS usuario_nombre
    FROM movimientos_materia_prima m
    LEFT JOIN usuarios u ON m.usuario_id = u.id
    WHERE m.codigo_materia_prima = ?
    ORDER BY m.fecha DESC LIMIT 100");
  $rows->execute([$codigo]);
  jsonResponse($rows->fetchAll());
}

jsonError('Ruta no encontrada', 404);
