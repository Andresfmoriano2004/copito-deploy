<?php
/**
 * Suite: autenticación y límite de intentos de login.
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO bloquea el acceso real ni toca la tabla
 * `login_intentos` de producción.
 *
 * El límite de intentos es la única defensa que tiene un JWT contra la
 * fuerza bruta, y esas tres ramas (fallo, bloqueo, desbloqueo) no estaban
 * automatizadas. Cubre:
 *   - 5 fallos seguidos bloquean la IP 15 minutos (429);
 *   - una vez bloqueado, ni siquiera la contraseña CORRECTA pasa;
 *   - el bloqueo vence solo y deja entrar;
 *   - una ventana deslizante evita acumular fallos viejos;
 *   - los mensajes no revelan si el usuario existe;
 *   - un usuario desactivado no entra ni con su propio token.
 *
 * Ejecutar: php tests/test_auth_ratelimit.php
 */
require_once __DIR__ . '/testdb.php';

putenv('DB_NAME=' . T_DB);
putenv('TEST_API=http://' . T_HOST . ':' . T_PUERTO . '/api');

require_once __DIR__ . '/helpers.php';

echo '[BD de pruebas ' . T_DB . ': ' . t_db_preparar() . "]\n";

$srv = t_servidor_arrancar();
if ($srv === false) {
  echo '  x ERROR: no se pudo arrancar el servidor de pruebas en ' . T_HOST . ':' . T_PUERTO . "\n";
  echo "  --- log del servidor ---\n" . t_log_tail() . "\n";
  echo '  Prueba a mano: ' . escapeshellarg(PHP_BINARY) . ' -S ' . T_HOST . ':' . T_PUERTO . " router.php\n";
  exit(1);
}

$pdo = t_pdo(T_DB);

// `login_intentos` no es volátil (es estado de seguridad del servidor), así
// que una corrida anterior que terminó a mitad del bloqueo dejaría la IP
// bloqueada para todas las pruebas de esta. Se limpia antes de empezar.
function t_rate_reset($pdo) {
  $pdo->exec('DELETE FROM login_intentos');
}

function t_rate_fila($pdo) {
  $st = $pdo->query('SELECT intentos, ultimo_intento, bloqueado_hasta FROM login_intentos LIMIT 1');
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

/** Login SIN cabecera Authorization: es el que hace el navegador de verdad. */
function t_login($user, $pass) {
  $ch = curl_init(TEST_API . '/auth/login');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode(['username' => $user, 'password' => $pass]),
  ]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);
  if ($raw === false) return [$code, ['_curl' => $err]];
  $d = json_decode($raw, true);
  return [$code, is_array($d) ? $d : ['_raw' => substr((string)$raw, 0, 200)]];
}

/** Petición SIN token, para probar el 401 de las rutas protegidas. */
function t_sin_token($method, $path) {
  $ch = curl_init(TEST_API . $path);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_TIMEOUT        => 15,
  ]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  $d = json_decode((string)$raw, true);
  return [$code, is_array($d) ? $d : []];
}

/** Usuario de prueba desactivado (borrado al final; `usuarios` no es volátil). */
function t_usuario_prueba($activo) {
  $pdo = t_pdo(T_DB);
  $u = 'tst_login_' . strtoupper(substr(md5(uniqid('', true)), 0, 6));
  $pdo->prepare('INSERT INTO usuarios (username, nombre, password_hash, rol, activo) VALUES (?,?,?,?,?)')
      ->execute([$u, 'Usuario de prueba de login', password_hash('secreto123', PASSWORD_DEFAULT), 'vendedor', $activo ? 1 : 0]);
  return $u;
}

t_rate_reset($pdo);
$pdo->exec("DELETE FROM usuarios WHERE username LIKE 'tst_login_%'");
$realLoginAntes = null;
try {
  $real = t_pdo(T_REAL);
  $realLoginAntes = (int)$real->query('SELECT COUNT(*) FROM login_intentos')->fetchColumn();
} catch (Exception $e) {
  $realLoginAntes = null; // la tabla aún no existe en producción: no hay nada que comparar
}

try {
  // ─── 1. Camino feliz ──────────────────────────────────────────────────────
  echo "\n  -- login correcto --\n";

  t_rate_reset($pdo);
  [$c, $r] = t_login('admin', 'admin123');
  t_ok('login correcto -> 200 con token', $c === 200 && !empty($r['token']),
       "HTTP $c " . json_encode(array_keys((array)$r)));
  t_ok('un login correcto borra el contador de intentos', t_rate_fila($pdo) === null,
       json_encode(t_rate_fila($pdo)));

  [$c, $me] = t_req('GET', '/auth/me');
  t_ok('el token sirve para /auth/me', $c === 200 && ($me['username'] ?? '') === 'admin',
       "HTTP $c " . json_encode($me));

  // ─── 2. Cinco fallos bloquean la IP ───────────────────────────────────────
  echo "\n  -- bloqueo por intentos --\n";

  t_rate_reset($pdo);
  $restantes = [];
  for ($i = 1; $i <= 4; $i++) {
    [$c, $r] = t_login('admin', 'clave-mala-' . $i);
    $restantes[] = [$c, (string)($r['error'] ?? '')];
  }
  t_ok('los 4 primeros fallos responden 401', $restantes[0][0] === 401 && $restantes[3][0] === 401,
       json_encode($restantes));
  t_ok('el 1er fallo anuncia 4 intentos restantes', str_contains($restantes[0][1], 'Intentos restantes: 4'),
       $restantes[0][1]);
  t_ok('el 4º fallo anuncia 1 intento restante', str_contains($restantes[3][1], 'Intentos restantes: 1'),
       $restantes[3][1]);

  [$c, $r] = t_login('admin', 'clave-mala-5');
  t_ok('el 5º fallo devuelve 429 (bloqueo)', $c === 429, "HTTP $c " . json_encode($r));

  $fila = t_rate_fila($pdo);
  t_ok('queda registrada la IP bloqueada con 5 intentos',
       $fila !== null && (int)$fila['intentos'] === 5 && $fila['bloqueado_hasta'] !== null,
       json_encode($fila));
  t_ok('el bloqueo vence en el futuro',
       $fila !== null && strtotime($fila['bloqueado_hasta']) > time(),
       json_encode($fila));

  // La clave: el bloqueo es por IP, no por usuario. La contraseña buena no sirve.
  [$c, $r] = t_login('admin', 'admin123');
  t_ok('con la IP bloqueada ni la contraseña correcta entra (429)', $c === 429,
       "HTTP $c " . json_encode($r));
  t_ok('el intento bloqueado NO suma al contador', (int)t_rate_fila($pdo)['intentos'] === 5,
       json_encode(t_rate_fila($pdo)));

  // ─── 3. El bloqueo vence solo ─────────────────────────────────────────────
  echo "\n  -- expiración del bloqueo --\n";

  $pdo->exec("UPDATE login_intentos SET bloqueado_hasta = DATE_SUB(NOW(), INTERVAL 1 MINUTE)");
  [$c, $r] = t_login('admin', 'admin123');
  t_ok('vencido el bloqueo, la contraseña correcta entra (200)',
       $c === 200 && !empty($r['token']), "HTTP $c " . json_encode($r));
  t_ok('al entrar se limpia la fila de intentos', t_rate_fila($pdo) === null,
       json_encode(t_rate_fila($pdo)));

  // ─── 4. Ventana deslizante ────────────────────────────────────────────────
  echo "\n  -- ventana deslizante --\n";

  $pdo->exec("DELETE FROM login_intentos");
  $pdo->exec("INSERT INTO login_intentos (ip, intentos, ultimo_intento, bloqueado_hasta)
              VALUES ('127.0.0.1', 4, DATE_SUB(NOW(), INTERVAL 20 MINUTE), NULL)");
  [$c, $r] = t_login('admin', 'clave-mala');
  t_ok('un fallo viejo (20 min) no acumula: responde 401, no 429', $c === 401,
       "HTTP $c " . json_encode($r));
  t_ok('la ventana se reinició y anuncia 4 restantes',
       str_contains((string)($r['error'] ?? ''), 'Intentos restantes: 4'), (string)($r['error'] ?? ''));

  // ─── 5. Credenciales y estados del usuario ────────────────────────────────
  echo "\n  -- credenciales --\n";

  t_rate_reset($pdo);
  [$c, $r] = t_login('usuario-que-no-existe', 'cualquiera');
  t_ok('usuario inexistente -> 401', $c === 401, "HTTP $c " . json_encode($r));
  t_ok('el mensaje no revela que el usuario no existe',
       stripos((string)($r['error'] ?? ''), 'no existe') === false
       && stripos((string)($r['error'] ?? ''), 'no encontrado') === false,
       (string)($r['error'] ?? ''));

  t_rate_reset($pdo);
  $uInactivo = t_usuario_prueba(false);
  [$c, $r] = t_login($uInactivo, 'secreto123');
  t_ok('usuario desactivado no puede iniciar sesión', $c === 401, "HTTP $c " . json_encode($r));

  // Su propio token tampoco le sirve: `requireAuth` revalida contra la BD.
  $pdoInactivo = t_pdo(T_DB);
  $st = $pdoInactivo->prepare('SELECT id, nombre FROM usuarios WHERE username=?');
  $st->execute([$uInactivo]);
  $rowInactivo = $st->fetch(PDO::FETCH_ASSOC);
  $tokInactivo = jwtEncode(['id' => (int)$rowInactivo['id'], 'username' => $uInactivo,
                            'nombre' => $rowInactivo['nombre'], 'rol' => 'vendedor']);
  [$c, $r] = t_req('GET', '/auth/me'); // con el token de admin: sirve de control
  t_ok('control: /auth/me con admin sigue en 200', $c === 200, "HTTP $c");
  $ch = curl_init(TEST_API . '/auth/me');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $tokInactivo],
  ]);
  curl_exec($ch);
  $codeInactivo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  t_ok('el token de un usuario desactivado deja de servir (401)', $codeInactivo === 401,
       "HTTP $codeInactivo");

  t_rate_reset($pdo);
  [$c, $r] = t_login('', 'admin123');
  t_ok('login sin usuario -> 400', $c === 400, "HTTP $c " . json_encode($r));
  t_ok('el 400 dice qué falta', str_contains((string)($r['error'] ?? ''), 'requeridos'),
       (string)($r['error'] ?? ''));

  [$c, $r] = t_login('admin', '');
  t_ok('login sin contraseña -> 400', $c === 400, "HTTP $c " . json_encode($r));

  [$c, $r] = t_sin_token('GET', '/auth/me');
  t_ok('/auth/me sin token -> 401', $c === 401, "HTTP $c " . json_encode($r));

  // ─── 6. Guardias ──────────────────────────────────────────────────────────
  echo "\n  -- guardias --\n";

  $tieneBloqueos = (int)$pdo->query('SELECT COUNT(*) FROM login_intentos')->fetchColumn();
  t_ok('la BD de pruebas termina sin filas de intentos (no dejan la IP bloqueada)',
       $tieneBloqueos === 0, "filas=$tieneBloqueos");

  $real = t_pdo(T_REAL);
  if ($realLoginAntes !== null) {
    $realDespues = (int)$real->query('SELECT COUNT(*) FROM login_intentos')->fetchColumn();
    t_ok('la BD real no acumuló intentos por culpa de la suite',
         $realDespues === $realLoginAntes, "antes=$realLoginAntes despues=$realDespues");
  } else {
    t_ok('la BD real no acumuló intentos por culpa de la suite', true, '(tabla no existía)');
  }

  $st = $real->query("SELECT COUNT(*) FROM usuarios WHERE username LIKE 'tst_login_%'");
  t_ok('la BD real no tiene usuarios de prueba de login', (int)$st->fetchColumn() === 0,
       'encontrados=' . (int)$st->fetchColumn());
} finally {
  $pdo->exec("DELETE FROM usuarios WHERE username LIKE 'tst_login_%'");
  $pdo->exec('DELETE FROM login_intentos');
  t_servidor_parar($srv);
}

exit(t_summary('auth_ratelimit') ? 1 : 0);
