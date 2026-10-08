<?php
/**
 * Suite: recetas con insumos — stock híbrido y costo teórico (v11).
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca el stock real del local.
 *
 * Antes de v11 una receta era solo un dato: se cargaba cuánto entra pero nada
 * la usaba, así que un producto "con receta" seguía exigiendo stock del
 * producto terminado y no existía ningún costo calculado. Esta suite cubre las
 * dos cosas que la receta ahora manda:
 *
 *   · Al cobrar, un producto con receta consume MATERIA PRIMA y el producto
 *     terminado ni se mueve; sin receta, manda el producto terminado como
 *     siempre. Si falta materia prima, la venta se bloquea.
 *   · Cancelar un pedido devuelve exactamente lo que se consumió.
 *   · Costo teórico = Σ(cantidad × costo del insumo) por unidad.
 *
 * Ejecutar: php tests/test_recetas_insumos.php
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

/** `materia_prima` y sus movimientos no son volátiles: esta suite limpia tras de sí. */
function t_mp_limpiar($pdo) {
  $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
  $pdo->exec("DELETE FROM movimientos_materia_prima WHERE codigo_materia_prima LIKE 'MPV11%'");
  $pdo->exec("DELETE FROM recetas WHERE codigo_materia_prima LIKE 'MPV11%'");
  $pdo->exec("DELETE FROM materia_prima WHERE codigo LIKE 'MPV11%'");
  $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
}

function t_mp_stock($codigo, $pdo) {
  $st = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0)
                       FROM movimientos_materia_prima WHERE codigo_materia_prima=?");
  $st->execute([$codigo]);
  return round((float)$st->fetchColumn(), 2);
}

/**
 * Producto con cero stock de terminado.
 *
 * Es la mitad que prueba el cambio: si la venta siguiera midiendo producto
 * terminado, ningún producto de esta suite podría agregarse al pedido.
 */
function t_producto_en_blanco($precio, $pdo) {
  $codigo = 'TST' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
  $pdo->prepare('INSERT INTO productos (codigo, nombre, unidad, grupo, stock_minimo, precio, costo) VALUES (?,?,?,?,?,?,?)')
      ->execute([$codigo, 'Producto con receta ' . $codigo, 'Und', 'General', 0, $precio, 0]);
  return $codigo;
}

t_mp_limpiar($pdo);

try {
  // ─── 1. Montaje: insumos, stock de materia prima y receta ─────────────────
  echo "\n  -- montaje --\n";

  $mpCafe = 'MPV11CAFE' . strtoupper(substr(md5(uniqid('', true)), 0, 3));
  $mpLeche = 'MPV11LECH' . strtoupper(substr(md5(uniqid('', true)), 0, 3));

  // Café: 120 por gramo. Leche: 40 por mililitro.
  [$c] = t_req('POST', '/materia-prima', ['codigo' => $mpCafe, 'nombre' => 'Café de prueba', 'unidad' => 'g', 'costo' => 120]);
  t_ok('crear café -> 200', $c === 200, "HTTP $c");
  [$c] = t_req('POST', '/materia-prima', ['codigo' => $mpLeche, 'nombre' => 'Leche de prueba', 'unidad' => 'ml', 'costo' => 40]);
  t_ok('crear leche -> 200', $c === 200, "HTTP $c");

  [$c] = t_req('POST', '/materia-prima/movimiento', ['codigo' => $mpCafe, 'tipo' => 'INGRESO', 'cantidad' => 1000, 'notas' => 'Stock inicial']);
  t_ok('entrada de 1000 g de café -> 200', $c === 200, "HTTP $c");
  [$c] = t_req('POST', '/materia-prima/movimiento', ['codigo' => $mpLeche, 'tipo' => 'INGRESO', 'cantidad' => 500, 'notas' => 'Stock inicial']);
  t_ok('entrada de 500 ml de leche -> 200', $c === 200, "HTTP $c");
  t_ok('stock de café = 1000', t_mp_stock($mpCafe, $pdo) === 1000.0, 'stock=' . t_mp_stock($mpCafe, $pdo));
  t_ok('stock de leche = 500', t_mp_stock($mpLeche, $pdo) === 500.0, 'stock=' . t_mp_stock($mpLeche, $pdo));

  // 20 g de café (120 c/u = 2.400) + 5 ml de leche (40 c/u = 200) = 2.600 por unidad.
  $codReceta = t_producto_en_blanco(8000, $pdo);
  [$c] = t_req('POST', '/recetas', ['codigoProducto' => $codReceta, 'codigoMateriaPrima' => $mpCafe, 'cantidad' => 20]);
  t_ok('receta con café -> 200', $c === 200, "HTTP $c");
  [$c] = t_req('POST', '/recetas', ['codigoProducto' => $codReceta, 'codigoMateriaPrima' => $mpLeche, 'cantidad' => 5]);
  t_ok('receta con leche -> 200', $c === 200, "HTTP $c");

  [$c, $r] = t_req('GET', '/recetas?producto=' . $codReceta);
  t_ok('la receta devuelve sus 2 insumos', $c === 200 && count($r) === 2, "HTTP $c " . json_encode($r));

  // ─── 2. La cantidad mínima tiene que sobrevivir el redondeo ───────────────
  echo "\n  -- cantidad mínima --\n";

  $codFraccional = t_producto_en_blanco(1000, $pdo);
  [$c, $r] = t_req('POST', '/recetas', ['codigoProducto' => $codFraccional, 'codigoMateriaPrima' => $mpCafe, 'cantidad' => 0.005]);
  t_ok('una cantidad que se redondea a 0 se rechaza (422)',
       $c === 422, "HTTP $c " . json_encode($r));
  t_ok('el rechazo explica la precisión', str_contains((string)($r['error'] ?? ''), '0.01'),
       (string)($r['error'] ?? ''));

  // El mismo corte en el PUT: sin él se podía crear una receta de 0 que existe
  // pero no consume nada, y la materia prima nunca bajaría.
  $idReceta = null;
  [$c, $r] = t_req('GET', '/recetas?producto=' . $codReceta);
  if ($c === 200 && $r) $idReceta = $r[0]['id'];
  t_ok('se obtiene el id de la receta para probar el PUT', $idReceta !== null, json_encode($r));
  [$c, $r] = t_req('PUT', '/recetas/' . $idReceta, ['cantidad' => 0]);
  t_ok('un PUT con cantidad 0 se rechaza (422)', $c === 422, "HTTP $c " . json_encode($r));
  [$c, $r] = t_req('GET', '/recetas?producto=' . $codReceta);
  t_ok('la receta sigue con sus cantidades originales',
       $c === 200 && count($r) === 2 && (float)$r[0]['cantidad'] > 0,
       json_encode(array_column($r, 'cantidad')));

  // ─── 3. Cobrar un producto con receta consume materia prima ───────────────
  echo "\n  -- cobro con receta --\n";

  [$c] = t_req('POST', '/caja/abrir', ['montoInicial' => 50000]);
  t_ok('abrir caja -> 200', $c === 200, "HTTP $c");

  $pid = t_crear_pedido('Mesa T-V11-1');
  [$c, $r] = t_req('POST', "/pedidos/$pid/items", [
    'codigo' => $codReceta, 'nombre' => 'Producto con receta', 'cantidad' => 2,
    'precioUnitario' => 8000, 'notas' => '', 'cuenta' => null,
  ]);
  t_ok('agregar 2 unidades sin stock de producto terminado -> 200',
       $c === 200, "HTTP $c " . json_encode($r));

  t_ok('agregarlo no inventó stock de producto terminado (sigue 0)',
       t_stock($codReceta, $pdo) === 0.0, 'stock=' . t_stock($codReceta, $pdo));
  t_ok('tampoco bajó materia prima: todavía no se cobró',
       t_mp_stock($mpCafe, $pdo) === 1000.0 && t_mp_stock($mpLeche, $pdo) === 500.0,
       'café=' . t_mp_stock($mpCafe, $pdo) . ' leche=' . t_mp_stock($mpLeche, $pdo));

  [$c, $r] = t_req('POST', "/pedidos/$pid/cerrar", ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 16000]]]);
  t_ok('cobrar el pedido -> 200', $c === 200, "HTTP $c " . json_encode($r));

  t_ok('al cobrar baja el café (1000 - 40 = 960)', t_mp_stock($mpCafe, $pdo) === 960.0,
       'stock=' . t_mp_stock($mpCafe, $pdo));
  t_ok('al cobrar baja la leche (500 - 10 = 490)', t_mp_stock($mpLeche, $pdo) === 490.0,
       'stock=' . t_mp_stock($mpLeche, $pdo));
  t_ok('el producto terminado sigue en 0: no se tocó',
       t_stock($codReceta, $pdo) === 0.0, 'stock=' . t_stock($codReceta, $pdo));

  $items = t_items($pid, $pdo);
  t_ok('el ítem queda marcado como pagado', (int)$items[0]['pagado'] === 1, 'pagado=' . $items[0]['pagado']);

  $salMov = (int)$pdo->query("SELECT COUNT(*) FROM movimientos WHERE codigo_producto='" . $codReceta . "'")->fetchColumn();
  t_ok('no se escribió ningún movimiento de producto terminado', $salMov === 0, "movs=$salMov");

  t_limpiar_pedido($pid);

  // ─── 4. Falta materia prima → la venta se bloquea ─────────────────────────
  echo "\n  -- sin materia prima --\n";

  $codHambre = t_producto_en_blanco(3000, $pdo);
  [$c] = t_req('POST', '/recetas', ['codigoProducto' => $codHambre, 'codigoMateriaPrima' => $mpCafe, 'cantidad' => 10000]);
  t_ok('receta que pide 10.000 g por unidad -> 200', $c === 200, "HTTP $c");

  $pid2 = t_crear_pedido('Mesa T-V11-2');
  [$c, $r] = t_req('POST', "/pedidos/$pid2/items", [
    'codigo' => $codHambre, 'nombre' => 'Producto con hambre', 'cantidad' => 1,
    'precioUnitario' => 3000, 'notas' => '', 'cuenta' => null,
  ]);
  t_ok('agregarlo se rechaza: no alcanza la materia prima', $c === 400, "HTTP $c " . json_encode($r));
  t_ok('el error nombra la materia prima que falta',
       stripos((string)($r['error'] ?? ''), 'materia prima') !== false, (string)($r['error'] ?? ''));
  t_ok('la materia prima no cambió con el intento fallido',
       t_mp_stock($mpCafe, $pdo) === 960.0, 'stock=' . t_mp_stock($mpCafe, $pdo));
  [$c, $r] = t_req('GET', "/pedidos/$pid2");
  t_ok('el pedido no quedó con el ítem', $c === 200 && empty($r['items']), json_encode($r['items'] ?? null));
  t_limpiar_pedido($pid2);

  // Control: un producto SIN receta sigue midiendo producto terminado.
  // `t_producto_con_stock()` devuelve un array con codigo/precio/stockInicial.
  $codTerminado = t_producto_con_stock(10, 5000, $pdo)['codigo'];
  $pid3 = t_crear_pedido('Mesa T-V11-3');
  [$c, $r] = t_req('POST', "/pedidos/$pid3/items", [
    'codigo' => $codTerminado, 'nombre' => 'Producto terminado', 'cantidad' => 20,
    'precioUnitario' => 5000, 'notas' => '', 'cuenta' => null,
  ]);
  t_ok('sin receta, el stock de producto terminado sigue mandando (400)',
       $c === 400, "HTTP $c " . json_encode($r));
  t_ok('y el mensaje es el de siempre', str_contains((string)($r['error'] ?? ''), 'Stock insuficiente'),
       (string)($r['error'] ?? ''));
  t_limpiar_pedido($pid3);

  // ─── 5. Cancelar devuelve exactamente lo que se consumió ──────────────────
  echo "\n  -- cancelación --\n";

  $pid4 = t_crear_pedido('Mesa T-V11-4');
  [$c, $r] = t_req('POST', "/pedidos/$pid4/items", [
    'codigo' => $codReceta, 'nombre' => 'Producto con receta', 'cantidad' => 1,
    'precioUnitario' => 8000, 'notas' => '', 'cuenta' => null,
  ]);
  $idItemReceta = $r['detalleId'] ?? null;
  t_ok('agregar 1 unidad con receta -> 200', $c === 200 && $idItemReceta, "HTTP $c " . json_encode($r));

  [$c, $r] = t_req('POST', "/pedidos/$pid4/items", [
    'codigo' => $codTerminado, 'nombre' => 'Producto terminado', 'cantidad' => 1,
    'precioUnitario' => 5000, 'notas' => '', 'cuenta' => null,
  ]);
  t_ok('agregar 1 unidad sin receta -> 200', $c === 200, "HTTP $c " . json_encode($r));

  // Se cobra SOLO el ítem con receta: el pedido sigue abierto por el otro.
  [$c, $r] = t_req('POST', "/pedidos/$pid4/pagar-item", [
    'detalleId' => $idItemReceta, 'pagos' => [['metodoPago' => 'Efectivo', 'monto' => 8000]],
  ]);
  t_ok('pagar solo el ítem con receta -> 200', $c === 200, "HTTP $c " . json_encode($r));
  t_ok('consume materia prima (960 - 20 = 940)', t_mp_stock($mpCafe, $pdo) === 940.0,
       'stock=' . t_mp_stock($mpCafe, $pdo));
  t_ok('consume la leche (490 - 5 = 485)', t_mp_stock($mpLeche, $pdo) === 485.0,
       'stock=' . t_mp_stock($mpLeche, $pdo));
  t_ok('el producto sin receta NO consume materia prima',
       t_stock($codTerminado, $pdo) === 10.0, 'stock=' . t_stock($codTerminado, $pdo));

  [$c, $ped] = t_req('GET', "/pedidos/$pid4");
  t_ok('el pedido sigue Abierto (queda el otro ítem sin pagar)',
       ($ped['estado'] ?? '') === 'Abierto', 'estado=' . ($ped['estado'] ?? ''));

  [$c, $r] = t_req('POST', "/pedidos/$pid4/cancelar", ['motivo' => 'Prueba de reversión v11']);
  t_ok('cancelar el pedido -> 200', $c === 200, "HTTP $c " . json_encode($r));
  t_ok('la cancelación devuelve el café (940 -> 960)', t_mp_stock($mpCafe, $pdo) === 960.0,
       'stock=' . t_mp_stock($mpCafe, $pdo));
  t_ok('la cancelación devuelve la leche (485 -> 490)', t_mp_stock($mpLeche, $pdo) === 490.0,
       'stock=' . t_mp_stock($mpLeche, $pdo));
  t_ok('el producto terminado tampoco se mueve (no estaba pagado)',
       t_stock($codTerminado, $pdo) === 10.0, 'stock=' . t_stock($codTerminado, $pdo));

  $devMp = (int)$pdo->query("SELECT COUNT(*) FROM movimientos_materia_prima
                              WHERE notas LIKE '%Pedido " . $pid4 . "%' AND tipo='INGRESO'")->fetchColumn();
  t_ok('la reversión quedó escrita en el historial de materia prima', $devMp === 2, "ingresos=$devMp");
  t_limpiar_pedido($pid4);

  // ─── 6. Costo teórico ─────────────────────────────────────────────────────
  echo "\n  -- costo teórico --\n";

  [$c, $costos] = t_req('GET', '/recetas/costos');
  t_ok('GET /recetas/costos -> 200', $c === 200, "HTTP $c");

  $porCodigo = [];
  foreach ((array)$costos as $f) $porCodigo[$f['codigo']] = $f;

  $f = $porCodigo[$codReceta] ?? null;
  t_ok('el producto con receta tiene costo teórico', $f !== null && $f['costoTeorico'] !== null,
       json_encode($f));
  // 20 g × 120 = 2.400  +  5 ml × 40 = 200  →  2.600
  t_ok('costo teórico = 20×120 + 5×40 = 2.600', $f !== null && abs($f['costoTeorico'] - 2600) < 0.01,
       'costo=' . ($f['costoTeorico'] ?? 'null'));
  t_ok('cuenta los 2 insumos', $f !== null && (int)$f['insumos'] === 2, 'insumos=' . ($f['insumos'] ?? 'null'));
  t_ok('margen = 8.000 - 2.600 = 5.400', $f !== null && abs($f['margen'] - 5400) < 0.01,
       'margen=' . ($f['margen'] ?? 'null'));
  t_ok('margen sobre precio = 67.5%', $f !== null && abs($f['margenPct'] - 67.5) < 0.05,
       'pct=' . ($f['margenPct'] ?? 'null'));

  $g = $porCodigo[$codTerminado] ?? null;
  t_ok('un producto sin receta no tiene costo teórico (no se inventa)',
       $g !== null && $g['costoTeorico'] === null, json_encode($g));
  t_ok('sin receta manda el costo registrado a mano',
       $g !== null && abs($g['costoEfectivo'] - $g['costoCatalogo']) < 0.01, json_encode($g));

  // ─── 7. Guardia: la BD real queda intacta ─────────────────────────────────
  echo "\n  -- guardia BD real --\n";

  $real = t_pdo(T_REAL);
  $st = $real->prepare("SELECT COUNT(*) FROM materia_prima WHERE codigo LIKE 'MPV11%'");
  $st->execute();
  t_ok('la BD real no tiene materia prima de prueba', (int)$st->fetchColumn() === 0,
       'encontradas=' . (int)$st->fetchColumn());

  $st = $real->prepare("SELECT COUNT(*) FROM recetas WHERE codigo_materia_prima LIKE 'MPV11%'");
  $st->execute();
  t_ok('la BD real no tiene recetas de prueba', (int)$st->fetchColumn() === 0,
       'encontradas=' . (int)$st->fetchColumn());

  $st = $real->prepare("SELECT COUNT(*) FROM movimientos_materia_prima WHERE codigo_materia_prima LIKE 'MPV11%'");
  $st->execute();
  t_ok('la BD real no tiene movimientos de materia prima de prueba', (int)$st->fetchColumn() === 0,
       'encontrados=' . (int)$st->fetchColumn());
} finally {
  t_mp_limpiar($pdo);
  t_servidor_parar($srv);
}

exit(t_summary('recetas_insumos') ? 1 : 0);
