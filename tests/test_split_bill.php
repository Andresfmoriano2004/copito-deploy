<?php
/**
 * Suite: cuentas (split bill).
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca la caja del día ni el stock real.
 *
 * El reparto de la cuenta es la operación con más superficie de error del POS:
 * dos personas pagan el mismo pedido y hay una sola fila de stock por producto.
 * Si el descuento se aplicara al total del pedido en vez de a los items de la
 * cuenta pagada, el inventario se descuenta de más; y si se aplicara dos veces,
 * se descuenta otra vez. Cubre:
 *   - cada cuenta se cierra con SU saldo, no con el del pedido;
 *   - el stock baja solo cuando la cuenta que contiene el item se salda;
 *   - cerrar una cuenta no cierra el pedido si queda la otra;
 *   - pagos de más y cuentas inexistentes se rechazan;
 *   - la suma de los pagos siempre da el total del pedido.
 *
 * Ejecutar: php tests/test_split_bill.php
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

function t_item_cuenta($pid, $codigo, $nombre, $cant, $precio, $cuenta) {
  return t_req('POST', "/pedidos/$pid/items", [
    'codigo' => $codigo, 'nombre' => $nombre, 'cantidad' => $cant,
    'precioUnitario' => $precio, 'notas' => '', 'cuenta' => $cuenta,
  ]);
}

function t_abonar($pid, $cuenta, $monto) {
  return t_req('POST', "/pedidos/$pid/abonar", [
    'cuenta' => $cuenta, 'pagos' => [['metodoPago' => 'Efectivo', 'monto' => $monto]],
  ]);
}

function t_cerrar_cuenta($pid, $cuenta, $monto) {
  return t_req('POST', "/pedidos/$pid/cerrar-cuenta", [
    'cuenta' => $cuenta, 'pagos' => [['metodoPago' => 'Efectivo', 'monto' => $monto]],
  ]);
}

try {
  // ─── 1. Montaje: caja abierta y dos cuentas ───────────────────────────────
  echo "\n  -- montaje --\n";

  [$c] = t_req('POST', '/caja/abrir', ['montoInicial' => 50000]);
  t_ok('abrir caja -> 200', $c === 200, "HTTP $c");

  $prodA = t_producto_con_stock(10, 10000, $pdo);
  $prodB = t_producto_con_stock(10, 20000, $pdo);

  $pid = t_crear_pedido('Mesa T-SPLIT-1');

  // El backend no adivina las cuentas: hay que declararlas antes del primer
  // item (es lo que hace el POS en pos_order.js antes de sincronizar).
  [$c] = t_req('PUT', "/pedidos/$pid", ['cuentasActivas' => ['A', 'B']]);
  t_ok('declarar cuentas A y B -> 200', $c === 200, "HTTP $c");

  [$c, $ped] = t_req('GET', "/pedidos/$pid");
  t_ok('el pedido expone sus cuentas activas',
       $c === 200 && ($ped['cuentasActivas'] ?? null) === ['A', 'B'],
       "HTTP $c " . json_encode($ped['cuentasActivas'] ?? null));

  [$c] = t_item_cuenta($pid, $prodA['codigo'], 'Producto A', 1, 10000, 'A');
  t_ok('agregar item a la cuenta A -> 200', $c === 200, "HTTP $c");
  [$c] = t_item_cuenta($pid, $prodB['codigo'], 'Producto B', 1, 20000, 'B');
  t_ok('agregar item a la cuenta B -> 200', $c === 200, "HTTP $c");

  [$c, $ped] = t_req('GET', "/pedidos/$pid");
  $cuentas = array_map(fn($i) => $i['cuenta'], $ped['items'] ?? []);
  t_ok('cada item queda en su cuenta', $cuentas === ['A', 'B'], json_encode($cuentas));
  t_ok('el total del pedido es la suma de las dos cuentas (30.000)',
       abs((float)($ped['total'] ?? 0) - 30000) < 0.01, 'total=' . ($ped['total'] ?? 'null'));

  [$c] = t_item_cuenta($pid, $prodA['codigo'], 'Item en cuenta fantasma', 1, 10000, 'Z');
  t_ok('una cuenta no declarada se rechaza al agregar items', $c === 400, "HTTP $c");

  // ─── 2. Validaciones de pago por cuenta ───────────────────────────────────
  echo "\n  -- validaciones --\n";

  [$c, $r] = t_abonar($pid, 'Z', 1000);
  t_ok('abonar a una cuenta inexistente se rechaza', $c === 400, "HTTP $c " . json_encode($r));

  [$c, $r] = t_abonar($pid, 'A', 0);
  t_ok('abonar $0 se rechaza', $c === 400, "HTTP $c " . json_encode($r));

  // ─── 3. Abono parcial de la cuenta A: NO descuenta stock todavía ─────────
  echo "\n  -- abono parcial --\n";

  [$c, $r] = t_abonar($pid, 'A', 5000);
  t_ok('abono parcial de A -> 200', $c === 200, "HTTP $c " . json_encode($r));
  t_ok('la cuenta A sigue abierta', ($r['cuentaCerrada'] ?? null) === false, json_encode($r));
  t_ok('queda la mitad pendiente en A', abs((float)($r['pendiente'] ?? -1) - 5000) < 0.01, json_encode($r));
  t_ok('con una cuenta a medias el pedido NO se cierra', ($r['pedidoCerrado'] ?? null) === false, json_encode($r));

  [$c, $ped] = t_req('GET', "/pedidos/$pid");
  t_ok('el pedido sigue Abierto', ($ped['estado'] ?? '') === 'Abierto', 'estado=' . ($ped['estado'] ?? ''));

  $items = t_items($pid, $pdo);
  $pagadoA = (int)$items[0]['pagado'];
  t_ok('el item de A sigue sin pagar', $pagadoA === 0, 'pagado=' . $pagadoA);

  t_ok('a mitad de pago de A el stock de A NO baja (sigue 10)',
       abs(t_stock($prodA['codigo'], $pdo) - 10) < 0.01, 'stock=' . t_stock($prodA['codigo'], $pdo));
  t_ok('el stock de B no se toca', abs(t_stock($prodB['codigo'], $pdo) - 10) < 0.01,
       'stock=' . t_stock($prodB['codigo'], $pdo));

  // ─── 4. Saldo completo de A: baja SOLO el stock de A ──────────────────────
  echo "\n  -- cierre de la cuenta A --\n";

  [$c, $r] = t_abonar($pid, 'A', 5000);
  t_ok('completar la cuenta A -> 200', $c === 200, "HTTP $c " . json_encode($r));
  t_ok('la cuenta A queda cerrada', ($r['cuentaCerrada'] ?? null) === true, json_encode($r));
  t_ok('el pedido sigue abierto porque falta la cuenta B', ($r['pedidoCerrado'] ?? null) === false, json_encode($r));
  t_ok('el mensaje indica que se pagó la cuenta, no el pedido',
       str_contains((string)($r['mensaje'] ?? ''), 'Cuenta pagada'), (string)($r['mensaje'] ?? ''));

  t_ok('al saldar A sí baja el stock de A (10 -> 9)',
       abs(t_stock($prodA['codigo'], $pdo) - 9) < 0.01, 'stock=' . t_stock($prodA['codigo'], $pdo));
  t_ok('y el de B sigue intacto (10)',
       abs(t_stock($prodB['codigo'], $pdo) - 10) < 0.01, 'stock=' . t_stock($prodB['codigo'], $pdo));

  $items = t_items($pid, $pdo);
  t_ok('el item de A queda marcado como pagado', (int)$items[0]['pagado'] === 1, 'pagado=' . $items[0]['pagado']);
  t_ok('el item de B sigue sin pagar', (int)$items[1]['pagado'] === 0, 'pagado=' . $items[1]['pagado']);

  [$c, $r] = t_abonar($pid, 'A', 1000);
  t_ok('volver a cobrar una cuenta ya pagada -> 409', $c === 409, "HTTP $c " . json_encode($r));

  [$c, $ped] = t_req('GET', "/pedidos/$pid");
  t_ok('el pedido sigue Abierto tras pagar A', ($ped['estado'] ?? '') === 'Abierto', 'estado=' . ($ped['estado'] ?? ''));
  t_ok('el pedido acumula la mitad del total (10.000)',
       abs((float)($ped['totalPagado'] ?? -1) - 10000) < 0.01, 'pagado=' . ($ped['totalPagado'] ?? 'null'));

  // ─── 5. Cuenta B: exceso y cierre ─────────────────────────────────────────
  echo "\n  -- cierre de la cuenta B --\n";

  [$c, $r] = t_abonar($pid, 'B', 999999);
  t_ok('pagar de más en la cuenta B se rechaza', $c === 400, "HTTP $c " . json_encode($r));
  t_ok('el error dice cuánto falta',
       str_contains((string)($r['error'] ?? ''), 'saldo pendiente'), (string)($r['error'] ?? ''));

  [$c, $r] = t_cerrar_cuenta($pid, 'B', 20000);
  t_ok('cerrar la cuenta B por su total -> 200', $c === 200, "HTTP $c " . json_encode($r));

  t_ok('baja el stock de B (10 -> 9)', abs(t_stock($prodB['codigo'], $pdo) - 9) < 0.01,
       'stock=' . t_stock($prodB['codigo'], $pdo));
  t_ok('el stock de A no baja dos veces (sigue 9)', abs(t_stock($prodA['codigo'], $pdo) - 9) < 0.01,
       'stock=' . t_stock($prodA['codigo'], $pdo));

  [$c, $ped] = t_req('GET', "/pedidos/$pid");
  t_ok('al saldar las dos cuentas el pedido se cierra', ($ped['estado'] ?? '') === 'Cerrado',
       'estado=' . ($ped['estado'] ?? ''));
  $itemsPagados = count(array_filter($ped['items'] ?? [], fn($i) => (int)$i['pagado'] === 1));
  t_ok('todos los items quedan pagados', $itemsPagados === 2, "pagados=$itemsPagados");
  t_ok('la suma de los pagos da el total del pedido',
       abs((float)($ped['totalPagado'] ?? -1) - 30000) < 0.01, 'pagado=' . ($ped['totalPagado'] ?? 'null'));
  t_ok('no queda saldo pendiente', abs((float)($ped['saldoRestante'] ?? -1)) < 0.01,
       'saldo=' . ($ped['saldoRestante'] ?? 'null'));

  // ─── 6. Un pedido cerrado ya no admite más pagos ──────────────────────────
  echo "\n  -- pedido cerrado --\n";

  [$c, $r] = t_abonar($pid, 'A', 1000);
  t_ok('abonar sobre un pedido cerrado -> 409', $c === 409, "HTTP $c " . json_encode($r));
  [$c, $r] = t_cerrar_cuenta($pid, 'B', 1000);
  t_ok('cerrar cuenta sobre un pedido cerrado se rechaza', $c !== 200, "HTTP $c " . json_encode($r));
  t_ok('el rechazo no mueve el stock otra vez',
       abs(t_stock($prodA['codigo'], $pdo) - 9) < 0.01 && abs(t_stock($prodB['codigo'], $pdo) - 9) < 0.01,
       'A=' . t_stock($prodA['codigo'], $pdo) . ' B=' . t_stock($prodB['codigo'], $pdo));

  // ─── 7. Guardia: la BD real queda intacta ─────────────────────────────────
  echo "\n  -- guardia BD real --\n";

  $real = t_pdo(T_REAL);
  $st = $real->prepare('SELECT COUNT(*) FROM pedidos WHERE cliente=?');
  $st->execute([TEST_TAG]);
  t_ok('la BD real no contiene pedidos de prueba', (int)$st->fetchColumn() === 0,
       'encontrados=' . (int)$st->fetchColumn());

  $st = $real->prepare('SELECT COUNT(*) FROM productos WHERE codigo=?');
  $st->execute([$prodA['codigo']]);
  $st2 = $real->prepare('SELECT COUNT(*) FROM productos WHERE codigo=?');
  $st2->execute([$prodB['codigo']]);
  t_ok('la BD real no contiene los productos de prueba',
       (int)$st->fetchColumn() === 0 && (int)$st2->fetchColumn() === 0);

  t_limpiar_pedido($pid);
} finally {
  if (isset($pid)) t_limpiar_pedido($pid);
  t_servidor_parar($srv);
}

exit(t_summary('split_bill') ? 1 : 0);
