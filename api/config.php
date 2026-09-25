<?php
// ─── Zona horaria ──────────────────────────────────────────────────────────
date_default_timezone_set('America/Bogota');

// ─── CORS ──────────────────────────────────────────────────────────────────
$appOrigin = getenv('APP_ORIGIN');
if ($appOrigin) header('Access-Control-Allow-Origin: ' . $appOrigin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// ─── Cargar .env ───────────────────────────────────────────────────────────
$envFile = __DIR__ . '/../../.env';
if (!file_exists($envFile)) $envFile = __DIR__ . '/../.env';
if (!file_exists($envFile)) $envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
  $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
  foreach ($lines as $line) {
    if (strpos(trim($line), '#') === 0) continue;
    $pos = strpos($line, '=');
    if ($pos !== false) {
      $k = trim(substr($line, 0, $pos));
      $v = substr($line, $pos + 1);
      $v = trim($v);
      if (strlen($v) >= 2) {
        $first = $v[0];
        $last = $v[strlen($v) - 1];
        if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
          $v = substr($v, 1, -1);
        }
      }
      if ($k !== '' && !getenv($k)) {
        putenv("$k=$v");
        $_ENV[$k] = $v;
      }
    }
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────
$appEnv = strtolower(trim((string)(getenv('APP_ENV') ?: 'development')));
defined('APP_ENV')    || define('APP_ENV',    $appEnv);

$dbPassEnv = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : getenv('DB_PASS');
$jwtSecretEnv = getenv('JWT_SECRET');

defined('DB_HOST')    || define('DB_HOST',    getenv('DB_HOST') ?: 'localhost');
defined('DB_PORT')    || define('DB_PORT',    getenv('DB_PORT') ?: '3306');
defined('DB_USER')    || define('DB_USER',    getenv('DB_USER') ?: '');
defined('DB_PASS')    || define('DB_PASS',    $dbPassEnv !== false ? $dbPassEnv : null);
defined('DB_NAME')    || define('DB_NAME',    getenv('DB_NAME') ?: '');
defined('JWT_SECRET') || define('JWT_SECRET', $jwtSecretEnv ?: '');

// ─── Shared modules ────────────────────────────────────────────────────────
require_once __DIR__ . '/shared/response.php';
require_once __DIR__ . '/shared/jwt.php';
require_once __DIR__ . '/shared/auth_middleware.php';
require_once __DIR__ . '/shared/validate.php';
require_once __DIR__ . '/shared/date_helpers.php';
require_once __DIR__ . '/shared/audit.php';
require_once __DIR__ . '/shared/pagination.php';
require_once __DIR__ . '/shared/payment_helpers.php';
require_once __DIR__ . '/shared/stock_helpers.php';
require_once __DIR__ . '/shared/order_helpers.php';
require_once __DIR__ . '/shared/caja_helpers.php';

// ─── Credentials check ─────────────────────────────────────────────────────
if (DB_PASS === null) {
  jsonError('Configuración del servidor incompleta: DB_PASS no está definido', 500);
}
if (APP_ENV === 'production' && DB_PASS === '') {
  jsonError('Configuración del servidor incompleta: DB_PASSWORD no puede estar vacío en producción', 500);
}
if (!JWT_SECRET || strlen(JWT_SECRET) < 16) {
  jsonError('Configuración del servidor incompleta: JWT_SECRET debe estar definido con al menos 16 caracteres', 500);
}

// ─── DB connection ─────────────────────────────────────────────────────────
function db() {
  static $pdo = null;
  if ($pdo === null) {
    try {
      if (!DB_USER || !DB_NAME || DB_PASS === null || !JWT_SECRET) {
        jsonError('Configuración del servidor incompleta', 500);
      }
      $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
      $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
      ]);
    } catch (PDOException $e) {
      error_log('Copito DB Connection Error: ' . $e->getMessage());
      jsonError('Error de conexión a la base de datos', 500);
    }
  }
  return $pdo;
}
