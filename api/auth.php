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

  $pdo = db();
  $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

  // Tabla para rate limiting
  try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_intentos (
      ip VARCHAR(45) PRIMARY KEY,
      intentos INT NOT NULL DEFAULT 0,
      ultimo_intento DATETIME NOT NULL,
      bloqueado_hasta DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $stmtRate = $pdo->prepare("SELECT intentos, bloqueado_hasta FROM login_intentos WHERE ip = ?");
    $stmtRate->execute([$ip]);
    $rateInfo = $stmtRate->fetch();

    if ($rateInfo && !empty($rateInfo['bloqueado_hasta'])) {
      $bloqueoHastaTs = strtotime($rateInfo['bloqueado_hasta']);
      if ($bloqueoHastaTs > time()) {
        $minutos = ceil(($bloqueoHastaTs - time()) / 60);
        jsonError("Demasiados intentos fallidos. Acceso bloqueado temporalmente por {$minutos} minuto(s).", 429);
      } else {
        $pdo->prepare("UPDATE login_intentos SET intentos = 0, bloqueado_hasta = NULL WHERE ip = ?")->execute([$ip]);
        $rateInfo['intentos'] = 0;
      }
    }
  } catch (Exception $e) {
    error_log('Error en rate limiting de login: ' . $e->getMessage());
  }

  try {
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE username = ? AND activo = TRUE');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
  } catch (Exception $e) {
    error_log('Error al consultar usuarios en base de datos: ' . $e->getMessage());
    jsonError('Error interno del servidor', 500);
  }

  if (!$user || !password_verify($password, $user['password_hash'])) {
    try {
      $intentos = ($rateInfo ? (int)$rateInfo['intentos'] : 0) + 1;
      if ($intentos >= 5) {
        $bloqueoDate = date('Y-m-d H:i:s', time() + (15 * 60)); // Bloqueo de 15 minutos
        $pdo->prepare("INSERT INTO login_intentos (ip, intentos, ultimo_intento, bloqueado_hasta)
          VALUES (?, ?, NOW(), ?)
          ON DUPLICATE KEY UPDATE intentos = ?, ultimo_intento = NOW(), bloqueado_hasta = ?")
          ->execute([$ip, $intentos, $bloqueoDate, $intentos, $bloqueoDate]);
        jsonError('Demasiados intentos fallidos. Acceso bloqueado temporalmente por 15 minutos.', 429);
      } else {
        $pdo->prepare("INSERT INTO login_intentos (ip, intentos, ultimo_intento, bloqueado_hasta)
          VALUES (?, ?, NOW(), NULL)
          ON DUPLICATE KEY UPDATE intentos = ?, ultimo_intento = NOW(), bloqueado_hasta = NULL")
          ->execute([$ip, $intentos, $intentos]);
        $restantes = 5 - $intentos;
        jsonError("Credenciales inválidas. Intentos restantes: {$restantes}", 401);
      }
    } catch (Exception $e) {
      error_log('Error al actualizar intentos de login: ' . $e->getMessage());
      jsonError('Credenciales inválidas', 401);
    }
  }

  // Resetear intentos en login exitoso
  try {
    $pdo->prepare("DELETE FROM login_intentos WHERE ip = ?")->execute([$ip]);
  } catch (Exception $e) {
    error_log('Error al limpiar intentos de login: ' . $e->getMessage());
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
