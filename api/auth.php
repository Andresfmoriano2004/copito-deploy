<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';

// POST /api/auth/login
if ($method === 'POST' && $path === 'auth/login') {
  $body = jsonBody();
  $username = $body['username'] ?? '';
  $password = $body['password'] ?? '';
  if (!$username || !$password) jsonError('Usuario y contraseña requeridos');

  try {
    $stmt = db()->prepare('SELECT * FROM usuarios WHERE username = ? AND activo = TRUE');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
  } catch (Exception $e) {
    jsonError('Error al consultar usuarios en base de datos: ' . $e->getMessage(), 500);
  }

  if (!$user || !password_verify($password, $user['password_hash'])) {
    jsonError('Credenciales inválidas', 401);
  }

  $token = jwtEncode([
    'id' => (int)$user['id'],
    'username' => $user['username'],
    'nombre' => $user['nombre'],
    'rol' => $user['rol'],
    'codigoReferencia' => $user['codigo_referencia']
  ]);

  jsonResponse([
    'token' => $token,
    'user' => [
      'id' => (int)$user['id'],
      'username' => $user['username'],
      'nombre' => $user['nombre'],
      'rol' => $user['rol'],
      'codigoReferencia' => $user['codigo_referencia']
    ]
  ]);
}

// GET /api/auth/me
if ($method === 'GET' && $path === 'auth/me') {
  $authUser = requireAuth();
  $stmt = db()->prepare('SELECT id, username, nombre, rol, activo FROM usuarios WHERE id = ?');
  $stmt->execute([$authUser['id']]);
  $user = $stmt->fetch();
  if (!$user) jsonError('Usuario no encontrado', 404);
  jsonResponse($user);
}

jsonError('Ruta no encontrada', 404);
