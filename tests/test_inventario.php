<?php
/**
 * Suite: inventario (productos y materia prima).
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca el stock real del local.
 *
 * Cubre la propiedad que sostiene todo el módulo: el stock no es un campo que
 * se edita, es la SUMA de los movimientos. De ahí salen las consecuencias que
 * interesan:
 *   - ninguna operación puede dejar el stock en negativo;
 *   - un movimiento rechazado no deja rastro (no se inserta a medias);
 *   - el historial coincide con lo que se movió;
 *   - una materia prima con movimientos no se puede borrar.
 *
 * También deja como regresión el bug de enrutado por el que el historial de
 * materia prima devolvía siempre 404 (la ruta genérica lo sombreaba).
 *
 * Ejecutar: php tests/test_inventario.php
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

/**
 * `materia_prima` y `movimientos_materia_prima` NO están en
 * `t_tablas_volatiles()` (no son datos de prueba: son el catálogo real del
 * local). Esta suite crea las suyas con prefijo `MPTEST` y limpia tras de sí,
 * al principio y al final, para que un fallo a mitad de corrida no deje
 * residuos para la siguiente.
 */
function t_mp_limpiar($pdo) {
  $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
  $pdo->exec("DELETE FROM movimientos_materia_prima WHERE codigo_materia_prima LIKE 'MPTEST%'");
  $pdo->exec("DELETE FROM materia_prima WHERE codigo LIKE 'MPTEST%'");
  $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
}

/** Stock de materia prima calculado igual que lo calcula la API. */
function t_mp_stock($codigo, $pdo) {
  $st = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0)
                       FROM movimientos_materia_prima WHERE codigo_materia_prima=?");
  $st->execute([$codigo]);
  return round((float)$st->fetchColumn(), 2);
}

/** Código de MP único y corto (el campo admite 20 caracteres). */
function t_mp_codigo($sufijo) {
  return 'MPTEST' . $sufijo . strtoupper(substr(md5(uniqid('', true)), 0, 5));
}

t_mp_limpiar($pdo);

try {
  $prod = t_producto_con_stock(100, 8000, $pdo);
  $codigo = $prod['codigo'];

  // ─── 1. Productos: el stock sale de los movimientos ───────────────────────
  echo "\n  -- productos --\n";

  t_ok('stock inicial = 100', abs(t_stock_de($codigo) - 100) < 0.01,
       'stock=' . var_export(t_stock_de($codigo), true));

  [$c] = t_req('POST', '/movimientos', ['codigo' => $codigo, 'tipo' => 'INGRESO', 'cantidad' => 5, 'nota' => 'Reposición']);
  t_ok('INGRESO de 5 -> 200', $c === 200, "HTTP $c");
  t_ok('stock queda 105', abs(t_stock_de($codigo) - 105) < 0.01,
       'stock=' . var_export(t_stock_de($codigo), true));

  [$c] = t_req('POST', '/movimientos', ['codigo' => $codigo, 'tipo' => 'SALIDA', 'cantidad' => 40, 'nota' => 'Merma']);
  t_ok('SALIDA de 40 -> 200', $c === 200, "HTTP $c");
  t_ok('stock queda 65', abs(t_stock_de($codigo) - 65) < 0.01,
       'stock=' . var_export(t_stock_de($codigo), true));

  // El fallo que importa: vender más de lo que hay no puede pasar.
  [$c] = t_req('POST', '/movimientos', ['codigo' => $codigo, 'tipo' => 'SALIDA', 'cantidad' => 999]);
  t_ok('SALIDA por encima del stock se rechaza', $c !== 200, "HTTP $c");
  t_ok('la salida rechazada NO cambia el stock (sigue 65)',
       abs(t_stock_de($codigo) - 65) < 0.01, 'stock=' . var_export(t_stock_de($codigo), true));

  [$c] = t_req('POST', '/movimientos', ['codigo' => $codigo, 'tipo' => 'AJUSTE', 'cantidad' => 10]);
  t_ok('tipo de movimiento desconocido se rechaza', $c !== 200, "HTTP $c");

  [$c] = t_req('POST', '/movimientos', ['codigo' => $codigo, 'tipo' => 'INGRESO', 'cantidad' => 0]);
  t_ok('cantidad 0 se rechaza', $c !== 200, "HTTP $c");

  [$c] = t_req('POST', '/movimientos', ['codigo' => 'NOEXISTE' . $prod['codigo'], 'tipo' => 'INGRESO', 'cantidad' => 10]);
  t_ok('ingreso a producto inexistente -> 404', $c === 404, "HTTP $c");
  t_ok('el 404 no crea movimiento huérfano',
       t_stock_de('NOEXISTE' . $prod['codigo']) === null || t_stock_de('NOEXISTE' . $prod['codigo']) == 0.0);

  [$c, $res] = t_req('GET', '/movimientos?page=1&limit=5');
  t_ok('GET /movimientos paginado -> 200 con total',
       $c === 200 && isset($res['total']) && (int)$res['total'] >= 2,
       "HTTP $c " . json_encode(array_keys((array)$res)));

  // Solo los movimientos que pasan las validaciones llegan a auditar: de los
  // 5 intentos de arriba, 2 fueron válidos (INGRESO de 5 y SALIDA de 40).
  $aud = (int)$pdo->query("SELECT COUNT(*) FROM auditoria WHERE operacion='REGISTRAR_MOVIMIENTO'")->fetchColumn();
  t_ok('los 2 movimientos aceptados quedan en la auditoría', $aud === 2, "auditoria=$aud");

  // ─── 2. Materia prima ─────────────────────────────────────────────────────
  echo "\n  -- materia prima --\n";

  $mp = t_mp_codigo('A');
  $mpB = t_mp_codigo('B');

  [$c] = t_req('POST', '/materia-prima', ['codigo' => $mp, 'nombre' => 'Materia de prueba', 'unidad' => 'g', 'stockMinimo' => 10, 'costo' => 1500]);
  t_ok('crear materia prima -> 200', $c === 200, "HTTP $c");

  [$c, $r] = t_req('GET', '/materia-prima/' . $mp);
  t_ok('la MP recién creada tiene stock 0',
       $c === 200 && abs((float)($r['stockActual'] ?? -1)) < 0.01,
       "HTTP $c " . json_encode($r));

  [$c, $r] = t_req('POST', '/materia-prima', ['codigo' => $mp, 'nombre' => 'Duplicada', 'unidad' => 'g']);
  t_ok('código de MP duplicado se rechaza', $c === 400 && str_contains((string)($r['error'] ?? ''), 'ya existe'),
       "HTTP $c " . json_encode($r));

  [$c] = t_req('POST', '/materia-prima/movimiento', ['codigo' => $mp, 'tipo' => 'INGRESO', 'cantidad' => 10, 'notas' => 'Compra']);
  t_ok('INGRESO de 10 a la MP -> 200', $c === 200, "HTTP $c");
  t_ok('stock de la MP = 10', t_mp_stock($mp, $pdo) === 10.0, 'stock=' . t_mp_stock($mp, $pdo));

  [$c] = t_req('POST', '/materia-prima/movimiento', ['codigo' => $mp, 'tipo' => 'SALIDA', 'cantidad' => 4]);
  t_ok('SALIDA de 4 a la MP -> 200', $c === 200, "HTTP $c");
  t_ok('stock de la MP = 6', t_mp_stock($mp, $pdo) === 6.0, 'stock=' . t_mp_stock($mp, $pdo));

  // Igual que en productos: la materia prima tampoco puede quedarse negativa.
  [$c, $r] = t_req('POST', '/materia-prima/movimiento', ['codigo' => $mp, 'tipo' => 'SALIDA', 'cantidad' => 100]);
  t_ok('SALIDA de MP por encima del stock se rechaza', $c !== 200, "HTTP $c " . json_encode($r));
  t_ok('la MP no queda con stock negativo', t_mp_stock($mp, $pdo) === 6.0, 'stock=' . t_mp_stock($mp, $pdo));

  [$c] = t_req('POST', '/materia-prima/movimiento', ['codigo' => $mp, 'tipo' => 'INGRESO', 'cantidad' => 0]);
  t_ok('movimiento de MP con cantidad 0 se rechaza', $c !== 200, "HTTP $c");

  [$c] = t_req('POST', '/materia-prima/movimiento', ['codigo' => 'MPNOEXISTE', 'tipo' => 'INGRESO', 'cantidad' => 5]);
  t_ok('movimiento sobre MP inexistente -> 404', $c === 404, "HTTP $c");

  // Regresión: `GET materia-prima/(.+)` sombreaba este endpoint y devolvía
  // siempre 404 "Materia prima no encontrada" (api/inventario/materia_prima.php).
  [$c, $r] = t_req('GET', '/materia-prima/historial/' . $mp);
  t_ok('historial de MP devuelve sus 2 movimientos',
       $c === 200 && is_array($r) && count($r) === 2,
       "HTTP $c " . json_encode($r));

  $audMp = (int)$pdo->query("SELECT COUNT(*) FROM auditoria WHERE operacion='MOVIMIENTO_MATERIA_PRIMA'")->fetchColumn();
  t_ok('los movimientos de MP quedan en la auditoría', $audMp >= 2, "auditoria=$audMp");

  [$c, $r] = t_req('DELETE', '/materia-prima/' . $mp);
  t_ok('no se puede borrar una MP con movimientos (409)',
       $c === 409, "HTTP $c " . json_encode($r));
  t_ok('la MP sigue existiendo tras el intento de borrado',
       $c === 409 && t_mp_stock($mp, $pdo) === 6.0);

  [$c] = t_req('PUT', '/materia-prima/' . $mp, ['costo' => 1750]);
  [$c2, $r2] = t_req('GET', '/materia-prima/' . $mp);
  t_ok('actualizar el costo se refleja en la consulta',
       $c === 200 && $c2 === 200 && abs((float)($r2['costo'] ?? 0) - 1750) < 0.01,
       "PUT=$c GET=$c2 " . json_encode($r2));

  // Una MP sin movimientos ni recetas sí se puede borrar.
  [$c] = t_req('POST', '/materia-prima', ['codigo' => $mpB, 'nombre' => 'Materia desechable', 'unidad' => 'Und', 'costo' => 0]);
  t_ok('crear la MP desechable -> 200', $c === 200, "HTTP $c");
  [$c] = t_req('DELETE', '/materia-prima/' . $mpB);
  t_ok('borrar una MP limpia -> 200', $c === 200, "HTTP $c");
  [$c] = t_req('GET', '/materia-prima/' . $mpB);
  t_ok('la MP borrada ya no existe (404)', $c === 404, "HTTP $c");

  // ─── 3. Guardia: la BD real queda intacta ─────────────────────────────────
  echo "\n  -- guardia BD real --\n";

  $real = t_pdo(T_REAL);
  $st = $real->prepare("SELECT COUNT(*) FROM materia_prima WHERE codigo LIKE 'MPTEST%'");
  $st->execute();
  t_ok('la BD real no tiene materia prima de prueba', (int)$st->fetchColumn() === 0,
       'encontradas=' . (int)$st->fetchColumn());

  $st = $real->prepare('SELECT COUNT(*) FROM movimientos WHERE codigo_producto=?');
  $st->execute([$codigo]);
  t_ok('la BD real no tiene movimientos del producto de prueba', (int)$st->fetchColumn() === 0,
       'encontrados=' . (int)$st->fetchColumn());

  t_mp_limpiar($pdo);
} finally {
  t_mp_limpiar($pdo);
  t_servidor_parar($srv);
}

exit(t_summary('inventario') ? 1 : 0);
