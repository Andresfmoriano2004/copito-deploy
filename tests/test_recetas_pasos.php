<?php
/**
 * Suite: recetas de preparación — procedimiento paso a paso (migración v10).
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca la BD real.
 *
 * `receta_pasos` responde CÓMO SE HACE un producto; `recetas` (v7a) responde
 * CUÁNTO ENTRA. Estas aserciones protegen justo esa separación:
 *   · el orden que se guarda es el orden que sale en la comanda;
 *   · el PUT es de reemplazo, así que nunca quedan huecos de numeración;
 *   · lo que no pasa la validación NO toca la receta ya guardada
 *     (jsonError hace exit: si corriera dentro de la transacción, la receta
 *     quedaría borrada a medias);
 *   · escribir la receta no mueve un solo byte de los insumos;
 *   · un producto = una receta: no se mezclan entre sí.
 *
 * Ejecutar: php tests/test_recetas_pasos.php
 */
require_once __DIR__ . '/testdb.php';

putenv('DB_NAME=' . T_DB);
putenv('TEST_API=http://' . T_HOST . ':' . T_PUERTO . '/api');

require_once __DIR__ . '/helpers.php';

echo '[BD de pruebas ' . T_DB . ': ' . t_db_preparar() . "]\n";

$srv = t_servidor_arrancar();
if ($srv === false) {
  echo "  x ERROR: no se pudo arrancar el servidor de pruebas en " . T_HOST . ':' . T_PUERTO . "\n";
  echo "  --- log del servidor ---\n" . t_log_tail() . "\n";
  exit(1);
}

$pdo = t_pdo(T_DB);

/** Petición con un token distinto al de admin (para probar el rol). */
function t_req_tok($method, $path, $token, $body = null) {
  $ch = curl_init(TEST_API . $path);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
  curl_setopt($ch, CURLOPT_TIMEOUT, 15);
  $headers = ['Authorization: Bearer ' . $token];
  if ($body !== null) {
    $headers[] = 'Content-Type: application/json';
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
  }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  $data = json_decode((string)$raw, true);
  return [$code, is_array($data) ? $data : []];
}

/** Pasos guardados de un producto, leídos directo en la BD. */
function t_pasos_bd($codigo, $pdo) {
  $st = $pdo->prepare('SELECT orden, titulo, instruccion, tiempo_min, equipo
                       FROM receta_pasos WHERE codigo_producto=? ORDER BY orden');
  $st->execute([$codigo]);
  return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** Crea un producto de prueba SIN stock (para poder borrarlo y probar la cascada). */
function t_producto_simple($pdo) {
  $codigo = 'TST' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
  $pdo->prepare('INSERT INTO productos (codigo, nombre, unidad, grupo, stock_minimo, precio, costo)
                 VALUES (?,?,?,?,?,?,?)')
      ->execute([$codigo, 'Receta de prueba ' . $codigo, 'Und', 'General', 0, 5000, 1000]);
  return $codigo;
}

// La receta de ejemplo que da el negocio: croassán con jamón y queso.
$croissant = [
  ['titulo' => 'Cortar',   'instruccion' => 'Partir el pan por la mitad',              'tiempoMin' => null, 'equipo' => null],
  ['titulo' => 'Salsar',   'instruccion' => 'Untar salsa chipotle en la parte de abajo', 'tiempoMin' => null, 'equipo' => null],
  ['titulo' => 'Rellenar', 'instruccion' => 'Poner jamón y queso',                      'tiempoMin' => null, 'equipo' => null],
  ['titulo' => 'Hornear',  'instruccion' => 'Meter a la air fryer',                     'tiempoMin' => 5,    'equipo' => 'Air Fryer'],
  ['titulo' => 'Terminar', 'instruccion' => 'Encima, queso crema',                      'tiempoMin' => null, 'equipo' => null],
  ['titulo' => 'Servir',   'instruccion' => 'Pimienta y hierbabuena',                   'tiempoMin' => null, 'equipo' => null],
];

try {
  // ─── 1. Esquema de la v10 ────────────────────────────────────────────────
  $existe = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA='" . T_DB . "' AND TABLE_NAME='receta_pasos'")->fetchColumn();
  t_ok('v10 creó la tabla receta_pasos', (int)$existe === 1);

  $cols = [];
  foreach ($pdo->query('SHOW COLUMNS FROM receta_pasos') as $r) $cols[$r['Field']] = $r['Type'];
  foreach (['codigo_producto', 'orden', 'titulo', 'instruccion', 'tiempo_min', 'equipo'] as $c) {
    t_ok("receta_pasos.$c existe", array_key_exists($c, $cols));
  }

  $idx = [];
  foreach ($pdo->query('SHOW INDEX FROM receta_pasos') as $r) $idx[$r['Key_name']][] = (int)$r['Seq_in_index'];
  t_ok('UNIQUE (codigo_producto, orden): no caben dos pasos en la misma posición',
       isset($idx['uq_receta_paso']) && count($idx['uq_receta_paso']) === 2);

  $fk = null;
  foreach ($pdo->query("SELECT kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, rc.DELETE_RULE
                        FROM information_schema.KEY_COLUMN_USAGE kcu
                        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                          ON  rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
                          AND rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
                          AND rc.TABLE_NAME        = kcu.TABLE_NAME
                        WHERE kcu.TABLE_SCHEMA = '" . T_DB . "'
                          AND kcu.TABLE_NAME   = 'receta_pasos'") as $r) {
    $fk = $r;
  }
  t_ok('la receta se borra con su producto (ON DELETE CASCADE)',
       $fk && $fk['DELETE_RULE'] === 'CASCADE'
         && $fk['COLUMN_NAME'] === 'codigo_producto'
         && $fk['REFERENCED_TABLE_NAME'] === 'productos',
       $fk ? "regla={$fk['DELETE_RULE']} col={$fk['COLUMN_NAME']} ref={$fk['REFERENCED_TABLE_NAME']}" : 'sin FK');

  // ─── 2. Un producto sin receta devuelve lista vacía ─────────────────────
  $p1 = t_producto_simple($pdo);
  [$code, $res] = t_req('GET', '/receta-pasos/' . $p1);
  t_ok('GET sin receta -> 200', $code === 200, "HTTP $code");
  t_ok('GET sin receta -> lista vacía', is_array($res) && count($res) === 0, json_encode($res));

  [$code] = t_req('GET', '/receta-pasos?producto=' . $p1);
  t_ok('GET por query string también responde', $code === 200, "HTTP $code");

  // ─── 3. Guardar la receta completa ──────────────────────────────────────
  [$code, $res] = t_req('PUT', '/receta-pasos/' . $p1, ['pasos' => $croissant]);
  t_ok('PUT la receta -> 200', $code === 200, "HTTP $code " . json_encode($res));
  t_ok('PUT reporta los 6 pasos', ($res['pasos'] ?? null) === 6, json_encode($res));

  $bd = t_pasos_bd($p1, $pdo);
  t_ok('quedaron 6 pasos en la BD', count($bd) === 6, 'hay ' . count($bd));
  t_ok('el orden es 1..6 correlativo',
       array_map('intval', array_column($bd, 'orden')) === [1, 2, 3, 4, 5, 6],
       json_encode(array_column($bd, 'orden')));

  [$code, $lista] = t_req('GET', '/receta-pasos/' . $p1);
  t_ok('GET devuelve los 6 pasos', count($lista) === 6);
  t_ok('el primer paso es "Partir el pan por la mitad"',
       ($lista[0]['instruccion'] ?? '') === 'Partir el pan por la mitad', json_encode($lista[0] ?? null));
  t_ok('el paso 4 lleva 5 minutos', ($lista[3]['tiempoMin'] ?? null) == 5,
       json_encode($lista[3]['tiempoMin'] ?? null));
  t_ok('el paso 4 indica el equipo (Air Fryer)', ($lista[3]['equipo'] ?? '') === 'Air Fryer');
  t_ok('el paso 4 conserva su título', ($lista[3]['titulo'] ?? '') === 'Hornear');
  t_ok('el primer paso conserva su título', ($lista[0]['titulo'] ?? '') === 'Cortar',
       json_encode($lista[0]['titulo'] ?? null));
  t_ok('la respuesta trae el nombre real del producto',
       ($lista[0]['productoNombre'] ?? '') !== '' && ($lista[0]['productoNombre'] ?? '') === ('Receta de prueba ' . $p1),
       json_encode($lista[0]['productoNombre'] ?? null));

  // ─── 4. Reemplazo atómico: no quedan huecos de numeración ──────────────
  $cortos = [
    ['titulo' => null, 'instruccion' => 'Partir el pan por la mitad', 'tiempoMin' => null, 'equipo' => null],
    ['titulo' => 'Servir', 'instruccion' => 'Pimienta y hierbabuena', 'tiempoMin' => null, 'equipo' => null],
  ];
  [$code, $res] = t_req('PUT', '/receta-pasos/' . $p1, ['pasos' => $cortos]);
  t_ok('reemplazar la receta -> 200', $code === 200, "HTTP $code");
  $bd = t_pasos_bd($p1, $pdo);
  t_ok('ahora solo quedan 2 pasos', count($bd) === 2, 'hay ' . count($bd));
  t_ok('el orden se renumeró 1,2 (sin huecos)',
       array_map('intval', array_column($bd, 'orden')) === [1, 2],
       json_encode(array_column($bd, 'orden')));
  t_ok('el paso 3 anterior ya no existe',
       !in_array('Poner jamón y queso', array_column($bd, 'instruccion'), true));

  // ─── 5. Lo que NO pasa la validación deja la receta intacta ─────────────
  // Si jsonError corriera dentro de la transacción, el DELETE ya se habría
  // hecho y la receta saldría vacía. Por eso la validación va antes.
  $malos = [
    'pasos no es lista'            => ['pasos' => 'hola'],
    'paso sin instrucción'         => ['pasos' => [['titulo' => 'x', 'instruccion' => '   ']]],
    'más de 50 pasos'              => ['pasos' => array_fill(0, 51, ['instruccion' => 'x'])],
    'tiempo negativo'              => ['pasos' => [['instruccion' => 'x', 'tiempoMin' => -1]]],
    'tiempo mayor que un día'      => ['pasos' => [['instruccion' => 'x', 'tiempoMin' => 2000]]],
    'título demasiado largo'       => ['pasos' => [['instruccion' => 'x', 'titulo' => str_repeat('a', 121)]]],
    'paso que no es un objeto'     => ['pasos' => ['texto suelto']],
  ];
  foreach ($malos as $etiqueta => $body) {
    [$code] = t_req('PUT', '/receta-pasos/' . $p1, $body);
    t_ok("$etiqueta -> 422", $code === 422, "HTTP $code");
  }
  $bd = t_pasos_bd($p1, $pdo);
  t_ok('ninguna validación fallida borró la receta guardada', count($bd) === 2,
       'quedan ' . count($bd) . ' pasos');

  // ─── 6. Producto inexistente ────────────────────────────────────────────
  [$code] = t_req('PUT', '/receta-pasos/TSTNOEXISTE', ['pasos' => $croissant]);
  t_ok('PUT de producto inexistente -> 404', $code === 404, "HTTP $code");
  $huerfanos = (int)$pdo->query("SELECT COUNT(*) FROM receta_pasos WHERE codigo_producto='TSTNOEXISTE'")->fetchColumn();
  t_ok('no creó pasos huérfanos', $huerfanos === 0, "hay $huerfanos");

  // ─── 7. Un producto = una receta: no se mezclan ─────────────────────────
  $p2 = t_producto_simple($pdo);
  [$code] = t_req('PUT', '/receta-pasos/' . $p2,
                  ['pasos' => [['instruccion' => 'Solo esto, y nada más']]]);
  t_ok('segunda receta guardada', $code === 200, "HTTP $code");

  [$code, $a] = t_req('GET', '/receta-pasos/' . $p1);
  [$code2, $b] = t_req('GET', '/receta-pasos/' . $p2);
  t_ok('la receta de A sigue teniendo 2 pasos', count($a) === 2, 'tiene ' . count($a));
  t_ok('la receta de B tiene 1 paso', count($b) === 1, 'tiene ' . count($b));
  t_ok('B no arrastra pasos de A',
       !in_array('Partir el pan por la mitad', array_column($b, 'instruccion'), true));

  [$code, $todos] = t_req('GET', '/receta-pasos');
  t_ok('GET global devuelve los pasos de los dos productos', is_array($todos) && count($todos) === 3,
       'hay ' . (is_array($todos) ? count($todos) : '??'));
  t_ok('GET global no duplica pasos',
       count(array_unique(array_map(fn($x) => $x['id'], $todos))) === count($todos));

  // ─── 8. Escribir la receta NO mueve los insumos (v7a) ───────────────────
  $mp = $pdo->query("SELECT codigo FROM materia_prima LIMIT 1")->fetchColumn();
  if (!$mp) {
    $pdo->exec("INSERT INTO materia_prima (codigo, nombre, unidad, stock_minimo, costo)
                VALUES ('MPRECA', 'Pan de croassán', 'Und', 0, 800)");
    $mp = 'MPRECA';
  }
  $pdo->prepare('INSERT INTO recetas (codigo_producto, codigo_materia_prima, cantidad, notas)
                 VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE cantidad=VALUES(cantidad)')
      ->execute([$p1, $mp, 1.5, 'un pan por unidad']);
  [$code] = t_req('PUT', '/receta-pasos/' . $p1, ['pasos' => $croissant]);
  t_ok('reescribir la preparación -> 200', $code === 200, "HTTP $code");
  $st = $pdo->prepare('SELECT cantidad, notas FROM recetas WHERE codigo_producto=? AND codigo_materia_prima=?');
  $st->execute([$p1, $mp]);
  $insumo = $st->fetch();
  t_ok('el insumo sigue intacto tras editar la preparación',
       $insumo && abs((float)$insumo['cantidad'] - 1.5) < 0.0001 && $insumo['notas'] === 'un pan por unidad',
       json_encode($insumo));

  // ─── 9. Borrar la preparación ───────────────────────────────────────────
  [$code] = t_req('DELETE', '/receta-pasos/' . $p2);
  t_ok('DELETE -> 200', $code === 200, "HTTP $code");
  [$code] = t_req('DELETE', '/receta-pasos/' . $p2);
  t_ok('DELETE dos veces -> 404', $code === 404, "HTTP $code");
  [$code, $lista] = t_req('GET', '/receta-pasos/' . $p2);
  t_ok('ya no tiene pasos', count($lista) === 0, 'quedan ' . count($lista));

  // ─── 10. La receta se borra con su producto ─────────────────────────────
  $p3 = t_producto_simple($pdo);
  [$code] = t_req('PUT', '/receta-pasos/' . $p3,
                  ['pasos' => [['instruccion' => 'Se va a borrar con el producto']]]);
  t_ok('tercera receta guardada', $code === 200, "HTTP $code");
  $pdo->prepare('DELETE FROM productos WHERE codigo=?')->execute([$p3]);
  $st = $pdo->prepare('SELECT COUNT(*) FROM receta_pasos WHERE codigo_producto=?');
  $st->execute([$p3]);
  t_ok('borrar el producto borró su preparación', (int)$st->fetchColumn() === 0);

  // ─── 11. Solo admin escribe; cualquier usuario autenticado lee ─────────
  $pdo->prepare("INSERT INTO usuarios (username, password_hash, nombre, rol, activo)
                 VALUES ('vendedor_receta','sin-hash','Vendedor de recetas','vendedor',1)
                 ON DUPLICATE KEY UPDATE rol='vendedor', activo=1")->execute();
  $vid = (int)$pdo->query("SELECT id FROM usuarios WHERE username='vendedor_receta'")->fetchColumn();
  $vTok = jwtEncode(['id' => $vid, 'username' => 'vendedor_receta',
                     'nombre' => 'Vendedor de recetas', 'rol' => 'vendedor']);

  [$code] = t_req_tok('GET', '/receta-pasos/' . $p1, $vTok);
  t_ok('vendedor puede LEER la receta', $code === 200, "HTTP $code");
  [$code] = t_req_tok('PUT', '/receta-pasos/' . $p1, $vTok, ['pasos' => $cortos]);
  t_ok('vendedor NO puede escribir (403)', $code === 403, "HTTP $code");
  [$code] = t_req_tok('DELETE', '/receta-pasos/' . $p1, $vTok);
  t_ok('vendedor NO puede borrar (403)', $code === 403, "HTTP $code");
  t_ok('la receta del admin sigue ahí', count(t_pasos_bd($p1, $pdo)) === 6);

  $ch = curl_init(TEST_API . '/receta-pasos/' . $p1);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
                          CURLOPT_CUSTOMREQUEST => 'GET']);
  curl_exec($ch);
  $sinToken = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  t_ok('sin token -> 401', $sinToken === 401, "HTTP $sinToken");

  // ─── 12. Guardia: la BD real no recibe pasos de prueba ──────────────────
  $real = t_pdo(T_REAL);
  $realExiste = (int)$real->query("SELECT COUNT(*) FROM information_schema.TABLES
                                   WHERE TABLE_SCHEMA='" . T_REAL . "' AND TABLE_NAME='receta_pasos'")->fetchColumn();
  if ($realExiste) {
    $n = (int)$real->query("SELECT COUNT(*) FROM receta_pasos WHERE codigo_producto LIKE 'TST%'")->fetchColumn();
    t_ok('la BD real no tiene pasos de productos de prueba', $n === 0, "hay $n");
  } else {
    t_ok('la BD real aún no tiene la v10 aplicada (aviso)', true);
  }

  $st = $pdo->prepare("SELECT COUNT(*) FROM receta_pasos WHERE codigo_producto LIKE 'TST%'");
  $st->execute();
  t_ok('la BD de pruebas sí tiene pasos de prueba', (int)$st->fetchColumn() >= 2,
       'hay ' . (int)$st->fetchColumn());

} finally {
  t_servidor_parar($srv);
}

exit(t_summary('recetas de preparación (v10)') ? 1 : 0);
