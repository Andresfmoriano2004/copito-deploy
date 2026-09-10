<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

// GET /api/unidades
if ($method === 'GET' && $path === 'unidades') {
  jsonResponse(db()->query('SELECT nombre FROM unidades ORDER BY nombre')->fetchAll(PDO::FETCH_COLUMN));
}

// POST /api/unidades
if ($method === 'POST' && $path === 'unidades') {
  $nombre = trim($body['nombre'] ?? '');
  if (!$nombre) jsonError('Nombre requerido');
  try {
    db()->prepare('INSERT INTO unidades (nombre) VALUES (?)')->execute([$nombre]);
    jsonResponse(['success' => true, 'mensaje' => 'Unidad creada']);
  } catch (PDOException $e) {
    if ($e->getCode() == 23000) jsonError('La unidad ya existe');
    jsonError($e->getMessage(), 500);
  }
}

// DELETE /api/unidades/{nombre}
if ($method === 'DELETE' && preg_match('#^unidades/(.+)$#', $path, $m)) {
  $nombre = urldecode($m[1]);
  db()->prepare('DELETE FROM unidades WHERE nombre=?')->execute([$nombre]);
  jsonResponse(['success' => true, 'mensaje' => 'Unidad eliminada']);
}

jsonError('Ruta no encontrada', 404);
