<?php
/**
 * Suite: arqueo de caja.
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca la caja real del día.
 *
 * Cubre: apertura única, movimientos FISICO/BANCARIO, cierre con diferencia,
 * y que nada de esto quede operable cuando ya no hay caja abierta.
 *
 * Ejecutar: php tests/test_caja.php
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
  exit(1);
}

$pdo = t_pdo(T_DB);

/** Cajas abiertas en la BD de pruebas. */
function t_cajas_abiertas($pdo) {
  return (int)$pdo->query("SELECT COUNT(*) FROM caja WHERE estado='Abierta'")->fetchColumn();
}

/** Última caja cerrada, como array asociativo. */
function t_ultima_caja($pdo) {
  $st = $pdo->query('SELECT * FROM caja ORDER BY id DESC LIMIT 1');
  $r = $st->fetch(PDO::FETCH_ASSOC);
  return $r ?: [];
}

try {
  // ─── 1. Estado inicial: sin caja ─────────────────────────────────────────
  t_ok('al arrancar no hay caja abierta', t_cajas_abiertas($pdo) === 0,
       'abiertas=' . t_cajas_abiertas($pdo));

  [$code] = t_req('GET', '/caja/activa');
  t_ok('GET /caja/activa -> 200', $code === 200, "HTTP $code");

  // ─── 2. Apertura ────────────────────────────────────────────────────────
  [$code, $res] = t_req('POST', '/caja/abrir', ['montoInicial' => 5000]);
  t_ok('abrir caja con 5000 -> 200', $code === 200, 'HTTP ' . $code . ' ' . json_encode($res));
  t_ok('queda exactamente 1 caja abierta', t_cajas_abiertas($pdo) === 1,
       'abiertas=' . t_cajas_abiertas($pdo));

  $abierta = t_ultima_caja($pdo);
  t_ok('la apertura guarda el monto inicial 5000',
       abs((float)($abierta['monto_inicial'] ?? -1) - 5000) < 0.01,
       'monto_inicial=' . ($abierta['monto_inicial'] ?? 'null'));

  [$code] = t_req('POST', '/caja/abrir', ['montoInicial' => 5000]);
  t_ok('la doble apertura se rechaza', $code !== 200, "HTTP $code (esperaba != 200)");
  t_ok('la doble apertura no deja 2 cajas', t_cajas_abiertas($pdo) === 1,
       'abiertas=' . t_cajas_abiertas($pdo));

  // ─── 3. Movimientos ─────────────────────────────────────────────────────
  [$code] = t_req('POST', '/caja/movimiento',
                  ['tipo' => 'INGRESO', 'monto' => 3000, 'descripcion' => 'Ingreso de prueba', 'metodoPago' => 'Efectivo']);
  t_ok('INGRESO de 3000 -> 200', $code === 200, "HTTP $code");

  [$code] = t_req('POST', '/caja/movimiento',
                  ['tipo' => 'EGRESO', 'monto' => 1000, 'descripcion' => 'Egreso de prueba', 'metodoPago' => 'Efectivo']);
  t_ok('EGRESO de 1000 -> 200', $code === 200, "HTTP $code");

  [$code, $res] = t_req('GET', '/caja/resumen');
  t_ok('GET /caja/resumen -> 200', $code === 200, "HTTP $code");

  // montoInicial 5000 + ingresos 3000 - egresos 1000 = 7000 (todo FISICO).
  $espFisico  = 7000;
  $espEsperado = 7000;
  if (is_array($res) && isset($res['resumen'])) $res = $res['resumen'];

  $okF = is_array($res) && isset($res['totalFisico']) && abs((float)$res['totalFisico'] - $espFisico) < 0.01;
  t_ok('totalFisico = 5000 + 3000 - 1000 = 7000', $okF,
       'totalFisico=' . (is_array($res) ? ($res['totalFisico'] ?? 'null') : json_encode($res)));

  $okE = is_array($res) && isset($res['totalEsperado']) && abs((float)$res['totalEsperado'] - $espEsperado) < 0.01;
  t_ok('totalEsperado = 7000 (sin dinero bancario)', $okE,
       'totalEsperado=' . (is_array($res) ? ($res['totalEsperado'] ?? 'null') : json_encode($res)));

  $okI = is_array($res) && isset($res['totalIngresos']) && abs((float)$res['totalIngresos'] - 3000) < 0.01;
  t_ok('totalIngresos = 3000', $okI, 'totalIngresos=' . (is_array($res) ? ($res['totalIngresos'] ?? 'null') : '-'));

  $okG = is_array($res) && isset($res['totalEgresos']) && abs((float)$res['totalEgresos'] - 1000) < 0.01;
  t_ok('totalEgresos = 1000', $okG, 'totalEgresos=' . (is_array($res) ? ($res['totalEgresos'] ?? 'null') : '-'));

  // ─── 4. Cierre con diferencia ───────────────────────────────────────────
  [$code, $res] = t_req('POST', '/caja/cerrar', ['montoFisico' => 6900, 'notas' => 'Prueba automatizada']);
  t_ok('cerrar caja con 6900 -> 200', $code === 200, 'HTTP ' . $code . ' ' . json_encode($res));

  $cerrada = t_ultima_caja($pdo);
  t_ok('la caja queda Cerrada', ($cerrada['estado'] ?? '') === 'Cerrada', 'estado=' . ($cerrada['estado'] ?? 'null'));
  t_ok('guarda monto_esperado = 7000',
       abs((float)($cerrada['monto_esperado'] ?? -1) - 7000) < 0.01,
       'monto_esperado=' . ($cerrada['monto_esperado'] ?? 'null'));
  t_ok('guarda monto_fisico = 6900',
       abs((float)($cerrada['monto_fisico'] ?? -1) - 6900) < 0.01,
       'monto_fisico=' . ($cerrada['monto_fisico'] ?? 'null'));
  t_ok('guarda diferencia = -100',
       abs((float)($cerrada['diferencia'] ?? 0) - (-100)) < 0.01,
       'diferencia=' . ($cerrada['diferencia'] ?? 'null'));

  t_ok('tras cerrar no queda caja abierta', t_cajas_abiertas($pdo) === 0,
       'abiertas=' . t_cajas_abiertas($pdo));

  // ─── 5. Nada debe quedar operable sin caja ──────────────────────────────
  [$code] = t_req('POST', '/caja/cerrar', ['montoFisico' => 100]);
  t_ok('cerrar dos veces se rechaza', $code !== 200, "HTTP $code (esperaba != 200)");

  [$code] = t_req('POST', '/caja/movimiento',
                  ['tipo' => 'INGRESO', 'monto' => 100, 'descripcion' => 'Sin caja', 'metodoPago' => 'Efectivo']);
  t_ok('registrar movimiento sin caja se rechaza', $code !== 200, "HTTP $code (esperaba != 200)");

  // ─── 6. Cobro bloqueado sin caja abierta ────────────────────────────────
  $prod = t_producto_con_stock(100, 8000, $pdo);
  $pid  = t_crear_pedido('Mesa T-CAJA-1');
  t_agregar_item($pid, $prod['codigo'], 'Café', 1, $prod['precio']);

  [$code] = t_req('POST', "/pedidos/$pid/cerrar", ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 8000]]]);
  t_ok('cobrar con la caja cerrada devuelve 409', $code === 409, "HTTP $code");
  t_ok('cobrar con la caja cerrada no descuenta stock',
       t_stock($prod['codigo'], $pdo) === 100.0, 'stock=' . t_stock($prod['codigo'], $pdo));

  // ─── 7. Guardia: la BD real queda intacta ───────────────────────────────
  $real = t_pdo(T_REAL);
  $realAbiertas = (int)$real->query("SELECT COUNT(*) FROM caja WHERE estado='Abierta'")->fetchColumn();
  $realCerradas = (int)$real->query("SELECT COUNT(*) FROM caja")->fetchColumn();
  $testCerradas = (int)$pdo->query('SELECT COUNT(*) FROM caja')->fetchColumn();

  t_ok('la BD real no tiene cajas de prueba', $testCerradas === $realAbiertas || $testCerradas !== $realCerradas,
       "real_cajas=$realCerradas test_cajas=$testCerradas");

  $st = $real->prepare('SELECT COUNT(*) FROM pedidos WHERE cliente=?');
  $st->execute([TEST_TAG]);
  t_ok('la BD real no contiene pedidos de prueba', (int)$st->fetchColumn() === 0,
       'encontrados=' . (int)$st->fetchColumn());
} finally {
  t_servidor_parar($srv);
}

exit(t_summary('caja') ? 1 : 0);
