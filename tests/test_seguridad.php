<?php
/**
 * Suite: superficie de exposición pública y control de rol.
 * SOLO LECTURA — no crea, modifica ni borra ningún registro.
 * Ejecutar: php tests/test_seguridad.php
 */
require_once __DIR__ . '/helpers.php';

const BASE_URL = 'http://localhost/copito-deploy';

/**
 * GET crudo contra cualquier ruta de la app (no solo /api).
 * Devuelve [código HTTP, cuerpo decodificado].
 */
function t_url($path, $token = null) {
  $ch = curl_init(BASE_URL . $path);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_TIMEOUT, 15);
  curl_setopt($ch, CURLOPT_HEADER, false);
  if ($token !== null) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $cerr = curl_error($ch);
  curl_close($ch);
  if ($raw === false) return [0, ['_curl' => $cerr]];
  $j = json_decode($raw, true);
  return [$code, is_array($j) ? $j : ['_raw' => substr((string)$raw, 0, 120)]];
}

// ─── 1. Material interno no debe ser servible por HTTP ──────────────────────
$bloqueados = [
  '/.git/HEAD'                   => 'historial completo del repo',
  '/.git/config'                 => 'configuración del repo (url remota)',
  '/tests/run_all.php'           => 'suite de pruebas (usa exec)',
  '/tests/helpers.php'           => 'harness con forja de JWT',
  '/Agente/auditoria-pos-prompt.md' => 'prompts de auditoría',
  '/README.md'                   => 'documentación interna',
  '/sql/dpcoffee.sql'            => 'esquema de la base de datos',
  '/router.php'                  => 'router del servidor PHP',
  '/.gitignore'                  => 'reglas de git',
  '/.env'                        => 'DB_PASSWORD y JWT_SECRET',
];

foreach ($bloqueados as $ruta => $queEs) {
  [$code] = t_url($ruta);
  t_ok("$ruta no expuesto ($queEs)", $code === 403, "devolvió HTTP $code");
}

// ─── 2. La SPA sigue accesible (no rompimos el front con los bloqueos) ──────
[$code] = t_url('/index.html');
t_ok('/index.html sigue sirviéndose', $code === 200, "devolvió HTTP $code");
[$code] = t_url('/sw.js');
t_ok('/sw.js sigue sirviéndose', $code === 200, "devolvió HTTP $code");

// ─── 3. Autenticación ───────────────────────────────────────────────────────
[$code] = t_url('/api/productos');
t_ok('GET /api/productos sin token -> 401', $code === 401, "devolvió HTTP $code");

[$code] = t_url('/api/caja/activa', t_token());
t_ok('GET /api/caja/activa con token admin -> 200', $code === 200, "devolvió HTTP $code");

// ─── 4. El rol sale de la BD, no del JWT ────────────────────────────────────
// El JWT va firmado con rol 'vendedor', pero el usuario es admin en la BD.
// Si el rol se leyera del token, /api/usuarios (requireRole admin) daría 403.
$admin = t_admin();
$tokRolFalso = jwtEncode(['id' => (int)$admin['id'], 'username' => $admin['username'], 'nombre' => $admin['nombre'], 'rol' => 'vendedor']);
[$code] = t_url('/api/usuarios', $tokRolFalso);
t_ok('token con rol=vendedor para un admin real -> 200 (manda la BD)', $code === 200, "devolvió HTTP $code");

// Un JWT bien firmado para un usuario que no existe en la BD debe rechazarse.
$tokInexistente = jwtEncode(['id' => 999999, 'username' => 'noexiste', 'nombre' => 'No Existe', 'rol' => 'admin']);
[$code] = t_url('/api/caja/activa', $tokInexistente);
t_ok('token de usuario inexistente -> 401', $code === 401, "devolvió HTTP $code");

// ─── 5. Esquema: la migración v8 debe estar aplicada ────────────────────────
[$code] = t_url('/api/propinas', t_token());
t_ok('GET /api/propinas -> 200 (tabla propinas creada por la v8)', $code === 200, "devolvió HTTP $code");

exit(t_summary('seguridad') ? 1 : 0);
