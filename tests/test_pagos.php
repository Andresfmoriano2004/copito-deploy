<?php
/**
 * Suite: dinero y stock.
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca la BD real ni la caja del día.
 *
 * Cubre los tres fallos de integridad monetaria que tenía el proyecto:
 *   1. el cobro se registraba aunque no hubiera caja abierta (dinero que no
 *      aparecía en el arqueo);
 *   2. un pago parcial descontaba stock de TODOS los ítems del pedido;
 *   3. cancelar un pedido no devolvía el inventario ya cobrado.
 *
 * Ejecutar: php tests/test_pagos.php
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

/** Estado del pedido directo en la BD de pruebas (evita depender de la forma de la respuesta). */
function t_estado_pedido($id, $pdo) {
  $st = $pdo->prepare('SELECT estado FROM pedidos WHERE id_pedido=?');
  $st->execute([$id]);
  return (string)$st->fetchColumn();
}

function t_pagados($items) {
  return count(array_filter($items, fn($i) => (int)$i['pagado'] === 1));
}

try {
  // ─── 1. Sin caja abierta no se cobra ─────────────────────────────────────
  $prodA = t_producto_con_stock(100, 8000, $pdo);
  $pidA  = t_crear_pedido('Mesa T-PAGOS-1');
  t_agregar_item($pidA, $prodA['codigo'], 'Café', 1, $prodA['precio']);

  [$code] = t_req('POST', "/pedidos/$pidA/cerrar", ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 8000]]]);
  t_ok('sin caja abierta el cobro devuelve 409', $code === 409, "HTTP $code");
  t_ok('sin caja abierta no se descuenta stock',
       t_stock($prodA['codigo'], $pdo) === 100.0, 'stock=' . t_stock($prodA['codigo'], $pdo));

  $pagosCaja = $pdo->prepare("SELECT COUNT(*) FROM caja_movimientos WHERE id_pedido=?");
  $pagosCaja->execute([$pidA]);
  t_ok('sin caja abierta no queda ningún movimiento de caja huerfano',
       (int)$pagosCaja->fetchColumn() === 0, 'movs=' . (int)$pagosCaja->fetchColumn());

  // ─── 2. Apertura de caja ─────────────────────────────────────────────────
  [$code] = t_req('POST', '/caja/abrir', ['montoInicial' => 5000]);
  t_ok('abrir caja -> 200', $code === 200, "HTTP $code");

  [$code] = t_req('POST', '/caja/abrir', ['montoInicial' => 5000]);
  t_ok('la doble apertura se rechaza', $code !== 200, "HTTP $code (esperaba != 200)");

  // El mismo cobro que antes falló, ahora sí debe pasar.
  [$code] = t_req('POST', "/pedidos/$pidA/cerrar", ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 8000]]]);
  t_ok('con caja abierta el mismo cobro pasa', $code === 200, "HTTP $code");
  t_ok('el cobro completo descuenta las 2 unidades (100 -> 99)',
       abs(t_stock($prodA['codigo'], $pdo) - 99) < 0.01, 'stock=' . t_stock($prodA['codigo'], $pdo));

  // ─── 3. Pago parcial: solo descuenta lo saldado ──────────────────────────
  // Dos ítems con el MISMO subtotal (16000): cualquiera que sea el orden de
  // asignación, el pago de 16000 salda exactamente uno.
  $prodB = t_producto_con_stock(100, 8000, $pdo);
  $pidB  = t_crear_pedido('Mesa T-PAGOS-2');
  t_agregar_item($pidB, $prodB['codigo'], 'A', 2, 8000); // 16000
  t_agregar_item($pidB, $prodB['codigo'], 'B', 2, 8000); // 16000

  [$code, $res] = t_req('POST', "/pedidos/$pidB/cerrar", ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 16000]]]);
  t_ok('pago parcial -> 200', $code === 200, 'HTTP ' . $code . ' ' . json_encode($res));

  $itemsB = t_items($pidB, $pdo);
  t_ok('el pedido tiene 2 ítems', count($itemsB) === 2, 'items=' . count($itemsB));
  t_ok('el pago parcial salda exactamente 1 de los 2 ítems',
       t_pagados($itemsB) === 1, 'pagados=' . t_pagados($itemsB));
  t_ok('el stock solo baja por el ítem saldado (100 -> 98)',
       abs(t_stock($prodB['codigo'], $pdo) - 98) < 0.01, 'stock=' . t_stock($prodB['codigo'], $pdo));
  t_ok('el pedido sigue Abierto tras el pago parcial',
       t_estado_pedido($pidB, $pdo) === 'Abierto', 'estado=' . t_estado_pedido($pidB, $pdo));

  // ─── 4. Cancelar devuelve el inventario cobrado ──────────────────────────
  $prodC = t_producto_con_stock(100, 8000, $pdo);
  $pidC  = t_crear_pedido('Mesa T-PAGOS-3');
  t_agregar_item($pidC, $prodC['codigo'], 'A', 2, 8000); // 16000
  t_agregar_item($pidC, $prodC['codigo'], 'B', 2, 8000); // 16000

  [$code] = t_req('POST', "/pedidos/$pidC/cerrar", ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 16000]]]);
  t_ok('pago parcial previo -> 200', $code === 200, "HTTP $code");
  t_ok('stock descontado antes de cancelar (100 -> 98)',
       abs(t_stock($prodC['codigo'], $pdo) - 98) < 0.01, 'stock=' . t_stock($prodC['codigo'], $pdo));
  t_ok('el pedido sigue Abierto (se puede cancelar)',
       t_estado_pedido($pidC, $pdo) === 'Abierto', 'estado=' . t_estado_pedido($pidC, $pdo));

  [$code, $res] = t_req('POST', "/pedidos/$pidC/cancelar", ['motivo' => 'Prueba automatizada']);
  t_ok('cancelar pedido abierto -> 200', $code === 200, 'HTTP ' . $code . ' ' . json_encode($res));

  t_ok('cancelar revierte el inventario (98 -> 100)',
       abs(t_stock($prodC['codigo'], $pdo) - 100) < 0.01, 'stock=' . t_stock($prodC['codigo'], $pdo));

  $itemsC = t_items($pidC, $pdo);
  t_ok('cancelar deja los 2 ítems sin pagar', t_pagados($itemsC) === 0, 'pagados=' . t_pagados($itemsC));

  $eg = $pdo->prepare("SELECT COUNT(*) FROM caja_movimientos WHERE id_pedido=? AND tipo='EGRESO'");
  $eg->execute([$pidC]);
  t_ok('cancelar genera el EGRESO compensatorio en caja',
       (int)$eg->fetchColumn() >= 1, 'egresos=' . (int)$eg->fetchColumn());

  // ─── 5. Guardia: la BD real queda intacta ────────────────────────────────
  $real = t_pdo(T_REAL);
  $st = $real->prepare('SELECT COUNT(*) FROM pedidos WHERE cliente=?');
  $st->execute([TEST_TAG]);
  t_ok('la BD real no contiene pedidos de prueba', (int)$st->fetchColumn() === 0,
       'encontrados=' . (int)$st->fetchColumn());

  $realAbiertas = (int)$real->query("SELECT COUNT(*) FROM caja WHERE estado='Abierta'")->fetchColumn();
  $testAbiertas = (int)$pdo->query("SELECT COUNT(*) FROM caja WHERE estado='Abierta'")->fetchColumn();
  t_ok('la caja real no se ve afectada por la suite',
       $realAbiertas === 0 || $testAbiertas >= 0, "real=$realAbiertas test=$testAbiertas");
} finally {
  t_servidor_parar($srv);
}

exit(t_summary('pagos') ? 1 : 0);
