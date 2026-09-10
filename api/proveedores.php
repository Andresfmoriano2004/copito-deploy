<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

// GET /api/proveedores — lista (solo activos por defecto; ?todos=1 incluye inactivos)
// Fase 2: ?page=&limit= activa {data,total,page,limit}; sin ellos, array legacy.
if ($method === 'GET' && ($path === 'proveedores' || strpos($path, 'proveedores?') === 0)) {
  $todos = isset($_GET['todos']) && $_GET['todos'] == '1';
  $pg = pageParams(50, 200);
  $where = $todos ? '' : 'WHERE activo=TRUE';
  $mapP = fn($r) => [
    'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'contacto' => $r['contacto'] ?? '',
    'telefono' => $r['telefono'] ?? '', 'telefono2' => $r['telefono2'] ?? '', 'email' => $r['email'] ?? '',
    'direccion' => $r['direccion'] ?? '', 'direccion2' => $r['direccion2'] ?? '', 'nit' => $r['nit'] ?? '',
    'comentarios' => $r['comentarios'] ?? '',
    'activo' => (bool)$r['activo']
  ];
  if ($pg['hasPaging']) {
    $total = (int)db()->query("SELECT COUNT(*) FROM proveedores $where")->fetchColumn();
    $rows = db()->query("SELECT id, nombre, contacto, telefono, telefono2, email, direccion, direccion2, nit, comentarios, activo FROM proveedores $where ORDER BY nombre LIMIT {$pg['limit']} OFFSET {$pg['offset']}")->fetchAll();
    pagedResponse(array_map($mapP, $rows), $total, $pg['page'], $pg['limit']);
  }
  $rows = db()->query("SELECT id, nombre, contacto, telefono, telefono2, email, direccion, direccion2, nit, comentarios, activo FROM proveedores $where ORDER BY nombre")->fetchAll();
  jsonResponse(array_map($mapP, $rows));
}

// POST /api/proveedores — crear
if ($method === 'POST' && $path === 'proveedores') {
  $nombre = trim($body['nombre'] ?? '');
  $contacto = trim($body['contacto'] ?? '') ?: null;
  $telefono = trim($body['telefono'] ?? '') ?: null;
  $telefono2 = trim($body['telefono2'] ?? '') ?: null;
  $email = trim($body['email'] ?? '') ?: null;
  $direccion = trim($body['direccion'] ?? '') ?: null;
  $direccion2 = trim($body['direccion2'] ?? '') ?: null;
  $nit = trim($body['nit'] ?? '') ?: null;
  $comentarios = trim($body['comentarios'] ?? '') ?: null;
  if (!$nombre) jsonError('Nombre requerido');
  if (mb_strlen($nombre) > 150) jsonError('Nombre muy largo (máx 150)');
  if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) jsonError('Email inválido');
  try {
    $pdo = db();
    $pdo->prepare('INSERT INTO proveedores (nombre, contacto, telefono, telefono2, email, direccion, direccion2, nit, comentarios) VALUES (?,?,?,?,?,?,?,?,?)')
      ->execute([$nombre, $contacto, $telefono, $telefono2, $email, $direccion, $direccion2, $nit, $comentarios]);
    $nuevoId = (int)$pdo->lastInsertId(); // antes de auditLog (ese INSERT cambiaría el id)
    auditLog($authUser, 'CREAR_PROVEEDOR', null, null, ['nombre' => $nombre]);
    jsonResponse(['success' => true, 'mensaje' => 'Proveedor creado', 'id' => $nuevoId], 201);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('El proveedor ya existe');
    jsonError('Error interno del servidor', 500);
  }
}

// PUT /api/proveedores/{id} — actualizar / reactivar
if ($method === 'PUT' && preg_match('#^proveedores/(\d+)$#', $path, $m)) {
  $id = (int)$m[1]; $sets = []; $vals = [];
  foreach (['nombre' => 150, 'contacto' => 100, 'telefono' => 30, 'telefono2' => 30, 'email' => 120, 'direccion' => 200, 'direccion2' => 200, 'nit' => 30] as $f => $max) {    if (array_key_exists($f, $body)) {
      $v = trim((string)($body[$f] ?? ''));
      if ($f === 'nombre' && $v === '') jsonError('Nombre requerido');
      if (mb_strlen($v) > $max) jsonError("Campo $f muy largo (máx $max)");
      if ($f === 'email' && $v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) jsonError('Email inválido');
      $sets[] = "$f=?"; $vals[] = $v ?: null;
    }
  }
  if (array_key_exists('comentarios', $body)) {
    $cm = trim((string)($body['comentarios'] ?? ''));
    if (mb_strlen($cm) > 2000) jsonError('Comentarios muy largos (máx 2000)');
    $sets[] = 'comentarios=?'; $vals[] = $cm ?: null;
  }
  if (array_key_exists('activo', $body)) { $sets[] = 'activo=?'; $vals[] = $body['activo'] ? 1 : 0; }
  if (!$sets) jsonError('Nada que actualizar');
  $vals[] = $id;
  try {
    $stmt = db()->prepare('UPDATE proveedores SET ' . implode(',', $sets) . ' WHERE id=?');
    $stmt->execute($vals);
    if ($stmt->rowCount() === 0) {
      $ex = db()->prepare('SELECT id FROM proveedores WHERE id=?'); $ex->execute([$id]);
      if (!$ex->fetch()) jsonError('Proveedor no encontrado', 404);
    }
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('El nombre de proveedor ya está en uso');
    throw $e;
  }
  auditLog($authUser, 'MODIFICAR_PROVEEDOR', null, null, ['proveedorId' => $id]);
  jsonResponse(['success' => true, 'mensaje' => 'Proveedor actualizado']);
}

// DELETE /api/proveedores/{id} — desactivación lógica (conserva historial)
if ($method === 'DELETE' && preg_match('#^proveedores/(\d+)$#', $path, $m)) {
  db()->prepare('UPDATE proveedores SET activo=FALSE WHERE id=?')->execute([(int)$m[1]]);
  auditLog($authUser, 'DESACTIVAR_PROVEEDOR', null, null, ['proveedorId' => (int)$m[1]]);
  jsonResponse(['success' => true, 'mensaje' => 'Proveedor desactivado']);
}

jsonError('Ruta no encontrada', 404);
