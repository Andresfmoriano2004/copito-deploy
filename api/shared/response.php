<?php
// ─── JSON response helpers ──────────────────────────────────────────────────

function jsonBody() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    if (trim((string)$raw) !== '') error_log('Copito JSON inválido en [' . ($_GET['route'] ?? '?') . ']');
    return [];
  }
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

function serverError($e) {
  error_log('Copito [' . ($_GET['route'] ?? '?') . ']: ' . get_class($e) . ': ' . $e->getMessage());
  jsonError('Error interno del servidor', 500);
}
