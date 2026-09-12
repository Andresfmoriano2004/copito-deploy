<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

// GET /api/grupos
if ($method === 'GET' && $path === 'grupos') {
  jsonResponse(db()->query('SELECT nombre FROM grupos ORDER BY nombre')->fetchAll(PDO::FETCH_COLUMN));
}

// POST /api/grupos
if ($method === 'POST' && $path === 'grupos') {
  $v = validate($body, ['nombre' => 'required|string|max:100']);
  try {
    db()->prepare('INSERT INTO grupos (nombre) VALUES (?)')->execute([$v['nombre']]);
    jsonResponse(['success' => true, 'mensaje' => 'Grupo creado']);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('El grupo ya existe');
    serverError($e);
  }
}

// DELETE /api/grupos/{nombre}
if ($method === 'DELETE' && preg_match('#^grupos/(.+)$#', $path, $m)) {
  $nombre = urldecode($m[1]);
  db()->prepare('DELETE FROM grupos WHERE nombre=?')->execute([$nombre]);
  jsonResponse(['success' => true, 'mensaje' => 'Grupo eliminado']);
}

jsonError('Ruta no encontrada', 404);
