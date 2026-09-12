<?php
// ─── Zona horaria oficial del negocio (Colombia) ───
// Fija la TZ antes de cualquier date()/strtotime()/NOW() para que PHP y
// MySQL hablen de la misma hora. Sin esto, en hostings con UTC por defecto
// las fechas se muestran adelantadas 5h y pueden caer en el día anterior.
date_default_timezone_set('America/Bogota');

// ─── CORS (siempre primero para que vayan en caso de error) ────────────
$appOrigin = getenv('APP_ORIGIN');
if ($appOrigin) header('Access-Control-Allow-Origin: ' . $appOrigin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// ─── Cargar .env si existe ───────────────────────────
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

// ─── Configuración ──────────────────────────────────
defined('DB_HOST')    || define('DB_HOST',    getenv('DB_HOST') ?: 'localhost');
defined('DB_PORT')    || define('DB_PORT',    getenv('DB_PORT') ?: '3306');
defined('DB_USER')    || define('DB_USER',    getenv('DB_USER') ?: '');
defined('DB_PASS')    || define('DB_PASS',    getenv('DB_PASSWORD') ?: (getenv('DB_PASS') ?: ''));
defined('DB_NAME')    || define('DB_NAME',    getenv('DB_NAME') ?: '');
defined('JWT_SECRET') || define('JWT_SECRET', getenv('JWT_SECRET') ?: '');

// ─── Conexión MySQL (PDO) ──────────────────────────
function db() {
  static $pdo = null;
  if ($pdo === null) {
    try {
      if (!DB_USER || !DB_NAME || !JWT_SECRET) {
        jsonError('Configuración del servidor incompleta', 500);
      }
      $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
      $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
      ]);
    } catch (PDOException $e) {
      jsonError('Error de conexión a la base de datos: ' . $e->getMessage(), 500);
    }
  }
  return $pdo;
}

// ─── JSON helpers ───────────────────────────────────
function jsonBody() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    if (trim((string)$raw) !== '') error_log('Copito JSON inválido en [' . ($_GET['route'] ?? '?') . ']');
    return [];
  }
  // Nunca loguear secretos: enmascara antes de escribir al error_log
  $log = $data;
  foreach (['password', 'token', 'contrasena', 'clave'] as $k) {
    if (array_key_exists($k, $log)) $log[$k] = '***';
  }
  error_log('Copito INPUT [' . ($_GET['route'] ?? '?') . ']: ' . json_encode($log, JSON_UNESCAPED_UNICODE));
  return $data;
}

function jsonResponse($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function jsonError($msg, $code = 400) {
  jsonResponse(['error' => $msg], $code);
}

// ─── JWT (HMAC-SHA256, sin dependencias) ────────────
function base64url($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function jwtEncode($payload) {
  $header = base64url('{"alg":"HS256","typ":"JWT"}');
  $payload['iat'] = time();
  $payload['exp'] = time() + 86400; // 24h
  $body = base64url(json_encode($payload));
  $sig = base64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
  return "$header.$body.$sig";
}

function jwtDecode($token) {
  $parts = explode('.', $token);
  if (count($parts) !== 3) return null;
  [$header, $body, $sig] = $parts;
  $expected = base64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
  if (!hash_equals($expected, $sig)) return null;
  $payload = json_decode(base64_decode(strtr($body, '-_', '+/') . str_repeat('=', (4 - strlen($body) % 4) % 4)), true);
  if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) return null;
  return $payload;
}

// ─── Auth middleware ────────────────────────────────
function getAuthorizationHeader() {
  // 1. Forma directa (funciona en Nginx / PHP built-in / algunos Apache)
  if (!empty($_SERVER['HTTP_AUTHORIZATION'])) return trim($_SERVER['HTTP_AUTHORIZATION']);
  // 2. Apache con mod_rewrite E=HTTP_AUTHORIZATION (ver .htaccess)
  if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
  // 3. Apache apache_request_headers / getallheaders (case-insensitive)
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

// Fase 3: acepta roles opcionales sin romper llamadas existentes requireAuth().
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

function auditLog($user, $operacion, $pedidoId = null, $mesa = null, $detalle = null) {
  $stmt = db()->prepare('INSERT INTO auditoria (usuario_id, codigo_referencia, operacion, pedido_id, mesa, detalle) VALUES (?,?,?,?,?,?)');
  $stmt->execute([(int)$user['id'], $user['codigo_referencia'] ?? null, $operacion, $pedidoId, $mesa, $detalle ? json_encode($detalle, JSON_UNESCAPED_UNICODE) : null]);
}

function validarMetodoPago($metodo) {
  return in_array($metodo, ['Efectivo', 'Transferencia'], true);
}

// ─── Fechas centralizadas (America/Bogota) ──────────────────────────────
// Entrada: datetime MySQL 'Y-m-d H:i:s' (o null). Salida: campos listos para
// mostrar en formato consistente DD/MM/YYYY + hh:mm AM/PM en todo el POS.
// Aditivo: los endpoints conservan sus campos actuales y agregan estos.
function fmtFechaBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return '';
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return '';
  return date('d/m/Y', $ts);
}

function fmtHoraBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return '';
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return '';
  return date('h:i A', $ts);
}

function fmtFechaHoraBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return '';
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return '';
  return date('d/m/Y h:i A', $ts);
}

// Devuelve el paquete completo para un datetime (ISO + partes mostradas).
function fechaBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return ['iso' => null, 'fecha' => '', 'hora' => '', 'fechaHora' => ''];
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return ['iso' => null, 'fecha' => '', 'hora' => '', 'fechaHora' => ''];
  return [
    'iso' => date('Y-m-d H:i:s', $ts),
    'fecha' => date('d/m/Y', $ts),
    'hora' => date('h:i A', $ts),
    'fechaHora' => date('d/m/Y h:i A', $ts)
  ];
}

// Normaliza alias históricos (QR, Llave Bancaria) al catálogo vigente.
// Los clientes PWA con caché antigua pueden seguir enviando QR.
function normalizarMetodoPago($metodo) {
  $m = trim((string)$metodo);
  $aliasBancario = ['QR', 'QR / Transferencia', 'Llave Bancaria', 'Transferencia bancaria', 'Transferencia Bancaria'];
  if (in_array($m, $aliasBancario, true)) return 'Transferencia';
  return $m;
}

// ─── Paginación (Fase 2: compatible hacia atrás) ─────────────────────────
// Si la petición NO trae page/limit, el endpoint responde el array legacy.
// Si trae page o limit, responde {data, total, page, limit}.
// Los LIMIT/OFFSET se interpolan como (int) porque MySQL nativo con
// ATTR_EMULATE_PREPARES=false no acepta placeholders en LIMIT.
function pageParams($defaultLimit = 50, $maxLimit = 500) {
  // Solo ?page= activa el envelope. ?limit/?offset solos siguen siendo legacy
  // (el frontend actual los envía esperando un array).
  $hasPaging = isset($_GET['page']);
  $page = max(1, (int)($_GET['page'] ?? 1));
  $limit = min($maxLimit, max(1, (int)($_GET['limit'] ?? $defaultLimit)));
  return ['page' => $page, 'limit' => $limit, 'hasPaging' => $hasPaging,
          'offset' => ($page - 1) * $limit];
}

function pagedResponse($data, $total, $page, $limit) {
  jsonResponse(['data' => array_values($data), 'total' => (int)$total,
                'page' => (int)$page, 'limit' => (int)$limit]);
}

// ─── Validación central (Fase 3) ──────────────────────────────────────
// Reglas por campo separadas por |: required, string, numeric, integer,
// email, in:a,b,c, max:N, min:N. Devuelve valores saneados (trim) o 422.
function validate($data, $rules) {
  if (!is_array($data)) $data = [];
  $out = [];
  foreach ($rules as $field => $ruleStr) {
    $ruleset = explode('|', (string)$ruleStr);
    $exists = array_key_exists($field, $data);
    $val = $exists ? $data[$field] : null;
    if (is_string($val)) $val = trim($val);
    if (!$exists || $val === '' || $val === null) {
      if (in_array('required', $ruleset, true)) jsonError("$field requerido", 422);
      $out[$field] = null;
      continue;
    }
    foreach ($ruleset as $r) {
      if ($r === 'required') continue;
      $parts = explode(':', $r, 2);
      $name = $parts[0]; $arg = $parts[1] ?? null;
      $isNum = is_numeric($val);
      if ($name === 'string' && !is_string($data[$field]) && !$isNum) jsonError("$field debe ser texto", 422);
      elseif ($name === 'numeric' && !$isNum) jsonError("$field debe ser numérico", 422);
      elseif ($name === 'integer' && filter_var($val, FILTER_VALIDATE_INT) === false) jsonError("$field debe ser entero", 422);
      elseif ($name === 'email' && !filter_var($val, FILTER_VALIDATE_EMAIL)) jsonError("$field inválido", 422);
      elseif ($name === 'in' && !in_array((string)$val, explode(',', (string)$arg), true)) jsonError("$field inválido", 422);
      elseif ($name === 'max' && ($isNum ? $val > $arg : mb_strlen((string)$val) > (int)$arg)) jsonError("$field excede el máximo ($arg)", 422);
      elseif ($name === 'min' && ($isNum ? $val < $arg : mb_strlen((string)$val) < (int)$arg)) jsonError("$field por debajo del mínimo ($arg)", 422);
    }
    $out[$field] = $val;
  }
  return $out;
}

// ─── Error 500 unificado: log interno, mensaje genérico al cliente ──────
function serverError($e) {
  error_log('Copito [' . ($_GET['route'] ?? '?') . ']: ' . get_class($e) . ': ' . $e->getMessage());
  jsonError('Error interno del servidor', 500);
}

// ─── (CORS ya enviado al inicio del archivo) ──────────────────────────
