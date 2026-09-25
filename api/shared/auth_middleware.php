<?php
// ─── Auth middleware ────────────────────────────────────────────────────────

function getAuthorizationHeader() {
  if (!empty($_SERVER['HTTP_AUTHORIZATION'])) return trim($_SERVER['HTTP_AUTHORIZATION']);
  if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
  if (function_exists('apache_request_headers')) {
    $h = apache_request_headers();
    foreach ($h as $k => $v) {
      if (strtolower($k) === 'authorization') return trim($v);
    }
  }
  if (function_exists('getallheaders')) {
    $h = getallheaders();
    foreach ($h as $k => $v) {
      if (strtolower($k) === 'authorization') return trim($v);
    }
  }
  return '';
}

function requireAuth($roles = []) {
  $auth = getAuthorizationHeader();
  if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) jsonError('Token no proporcionado', 401);
  $user = jwtDecode($m[1]);
  if (!$user) jsonError('Token inválido o expirado', 401);
  $stmt = db()->prepare('SELECT id, username, nombre, rol, codigo_referencia FROM usuarios WHERE id=? AND activo=TRUE');
  $stmt->execute([(int)($user['id'] ?? 0)]);
  $current = $stmt->fetch();
  if (!$current) jsonError('Usuario inactivo o no encontrado', 401);
  $user['codigo_referencia'] = $current['codigo_referencia'];
  if ($roles && !in_array($user['rol'], (array)$roles, true)) jsonError('No tienes permiso', 403);
  return $user;
}

function requireRole(...$roles) {
  return requireAuth($roles);
}
