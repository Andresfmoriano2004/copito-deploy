<?php
require_once __DIR__ . '/../config.php';
$authUser = requireRole('admin');

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();
$pdo = db();

// GET /api/usuarios
// Fase 2: ?page=&limit= activa {data,total,page,limit}; sin ellos, array legacy.
if ($method === 'GET' && $path === 'usuarios') {
  $pg = pageParams(50, 200);
  $mapU = fn($r) => ['id' => (int)$r['id'], 'username' => $r['username'], 'nombre' => $r['nombre'],
    'rol' => $r['rol'], 'activo' => (bool)$r['activo'],
    'codigo_referencia' => $r['codigo_referencia'], 'codigoReferencia' => $r['codigo_referencia']];
  if ($pg['hasPaging']) {
    $total = (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
    $rows = $pdo->query("SELECT id, username, nombre, rol, activo, codigo_referencia, fecha_creacion FROM usuarios ORDER BY id LIMIT {$pg['limit']} OFFSET {$pg['offset']}")->fetchAll();
    pagedResponse(array_map($mapU, $rows), $total, $pg['page'], $pg['limit']);
  }
  $rows = $pdo->query('SELECT id, username, nombre, rol, activo, codigo_referencia, fecha_creacion FROM usuarios ORDER BY id')->fetchAll();
  jsonResponse(array_map($mapU, $rows));
}

// POST /api/usuarios
if ($method === 'POST' && $path === 'usuarios') {
  $username = trim($body['username'] ?? ''); $password = $body['password'] ?? '';
  $nombre = trim($body['nombre'] ?? ''); $rol = $body['rol'] ?? 'vendedor';
  $codigoReferencia = strtoupper(trim($body['codigoReferencia'] ?? ''));
  if (!$username || !$password || !$nombre) jsonError('username, password y nombre requeridos');
  if (!in_array($rol, ['admin', 'vendedor'], true)) jsonError('Rol inválido');
  if ($codigoReferencia && !preg_match('/^[A-Z]{3}-[0-9]{3}$/', $codigoReferencia)) jsonError('Código inválido. Use formato MES-001 o ADM-001');
  if (strlen($password) < 6) jsonError('La contraseña debe tener al menos 6 caracteres');
  $hash = password_hash($password, PASSWORD_DEFAULT);
  try {
    $codigoReferencia = $codigoReferencia ?: null;
    $stmt = $pdo->prepare('INSERT INTO usuarios (username, password_hash, nombre, rol, codigo_referencia) VALUES (?,?,?,?,?)');
    $stmt->execute([$username, $hash, $nombre, $rol, $codigoReferencia]);
    auditLog($authUser, 'CREAR_USUARIO', null, null, ['username' => $username, 'rol' => $rol, 'codigoReferencia' => $codigoReferencia]);
    jsonResponse(['id' => (int)$pdo->lastInsertId(), 'username' => $username, 'nombre' => $nombre, 'rol' => $rol, 'codigoReferencia' => $codigoReferencia, 'activo' => true], 201);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) {
      // Distinguir qué UNIQUE falló para dar mensaje accionable (Reactiva vs cambia nombre)
      $chk = $pdo->prepare('SELECT username, codigo_referencia, activo FROM usuarios WHERE username=? OR (codigo_referencia=? AND ? IS NOT NULL AND ? <> ?) LIMIT 1');
      $chk->execute([$username, $codigoReferencia, $codigoReferencia, $codigoReferencia, '']);
      $ex = $chk->fetch();
      if ($ex && $ex['username'] === $username) jsonError('El nombre de usuario ya existe');
      if ($ex) {
        $estado = ((int)$ex['activo'] === 0) ? ' (está Inactivo). Reactívelo con el botón ♻️ de la tabla en vez de crearlo de nuevo' : '';
        jsonError('El código ' . $codigoReferencia . ' ya está en uso' . $estado);
      }
      jsonError('El nombre de usuario o código ya existe');
    }
    jsonError($e->getMessage(), 500);
  }
}

// PUT /api/usuarios/{id}
if ($method === 'PUT' && preg_match('#^usuarios/(\d+)$#', $path, $m)) {
  $id = (int)$m[1]; $sets = []; $vals = [];
  if (isset($body['nombre'])) { $sets[] = 'nombre=?'; $vals[] = $body['nombre']; }
  if (isset($body['rol'])) {
    if (!in_array($body['rol'], ['admin', 'vendedor'], true)) jsonError('Rol inválido');
    $sets[] = 'rol=?'; $vals[] = $body['rol'];
  }
  if (array_key_exists('codigoReferencia', $body)) {
    $cr = strtoupper(trim($body['codigoReferencia'] ?? ''));
    if ($cr !== '' && !preg_match('/^[A-Z]{3}-[0-9]{3}$/', $cr)) jsonError('Código inválido. Use formato MES-001 o ADM-001');
    $sets[] = 'codigo_referencia=?'; $vals[] = $cr ?: null;
  }
  if (isset($body['activo'])) { $sets[] = 'activo=?'; $vals[] = $body['activo'] ? 1 : 0; }
  if (isset($body['password'])) {
    if (strlen($body['password']) < 6) jsonError('La contraseña debe tener al menos 6 caracteres');
    $sets[] = 'password_hash=?'; $vals[] = password_hash($body['password'], PASSWORD_DEFAULT);
  }
  if (!$sets) jsonError('No hay campos para actualizar');
  $vals[] = $id;
  try {
    $pdo->prepare("UPDATE usuarios SET " . implode(',', $sets) . " WHERE id=?")->execute($vals);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('El código de referencia ya está en uso');
    throw $e;
  }
  auditLog($authUser, 'MODIFICAR_USUARIO', null, null, ['usuarioId' => $id]);
  jsonResponse(['message' => 'Usuario actualizado']);
}

// DELETE /api/usuarios/{id}
if ($method === 'DELETE' && preg_match('#^usuarios/(\d+)$#', $path, $m)) {
  $id = (int)$m[1];
  if ($id === $authUser['id']) jsonError('No puedes desactivar tu propio usuario');
  $pdo->prepare('UPDATE usuarios SET activo=FALSE WHERE id=?')->execute([$id]);
  auditLog($authUser, 'DESACTIVAR_USUARIO', null, null, ['usuarioId' => $id]);
  jsonResponse(['message' => 'Usuario desactivado']);
}

jsonError('Ruta no encontrada', 404);
