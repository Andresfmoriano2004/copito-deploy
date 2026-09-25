<?php
// ─── JWT (HMAC-SHA256, sin dependencias externas) ──────────────────────────

function base64url($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function jwtEncode($payload) {
  $header = base64url('{"alg":"HS256","typ":"JWT"}');
  $payload['iat'] = time();
  $payload['exp'] = time() + 86400;
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
