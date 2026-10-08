<?php
/**
 * Suite: facturación — Comprobante de venta ("Camino A").
 *
 * Corre contra la BD aislada `dpcoffee_test` y un servidor PHP propio
 * (tests/testdb.php) — NO toca la BD real.
 *
 * Cubre el contrato del Camino A:
 *   · el precio del catálogo YA incluye IVA y se desgrana (base + iva == total);
 *   · el comprobante se emite SOLO al cobrar el total — un pago parcial no emite;
 *   · la numeración correlativa no se repite ni se gasta sin emitir;
 *   · un pedido facturado queda inmutable (sus líneas son el soporte fiscal);
 *   · el NIT del cliente se guarda sin formato y se formatea al imprimir.
 *
 * Ejecutar: php tests/test_facturacion.php
 */
require_once __DIR__ . '/testdb.php';

putenv('DB_NAME=' . T_DB);
putenv('TEST_API=http://' . T_HOST . ':' . T_PUERTO . '/api');

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../api/shared/facturacion_helpers.php';

echo '[BD de pruebas ' . T_DB . ': ' . t_db_preparar() . "]\n";

$srv = t_servidor_arrancar();
if ($srv === false) {
  echo "  x ERROR: no se pudo arrancar el servidor de pruebas en " . T_HOST . ':' . T_PUERTO . "\n";
  echo "  --- log del servidor ---\n" . t_log_tail() . "\n";
  exit(1);
}

$pdo = t_pdo(T_DB);

/** Estado actual de un pedido, leído directo en la BD. */
function t_estado($id, $pdo) {
  $st = $pdo->prepare('SELECT estado FROM pedidos WHERE id_pedido=?');
  $st->execute([$id]);
  return $st->fetchColumn();
}

/** Número de comprobante asignado a un pedido, o null. */
function t_num($id, $pdo) {
  $st = $pdo->prepare('SELECT numero_factura FROM pedidos WHERE id_pedido=?');
  $st->execute([$id]);
  $v = $st->fetchColumn();
  return $v === false ? null : $v;
}

/** Fila de `facturas` por número. */
function t_fac($numero, $pdo) {
  $st = $pdo->prepare('SELECT * FROM facturas WHERE numero=?');
  $st->execute([$numero]);
  return $st->fetch();
}

/** Valor de la fila `facturacion_consecutivos`. */
function t_sig($pdo) {
  $st = $pdo->query('SELECT siguiente FROM facturacion_consecutivos');
  return (int)$st->fetchColumn();
}

/**
 * Descarga una respuesta NO-JSON (la vista de impresión de /pedidos/{id}/pdf).
 * t_req() decodifica el cuerpo y lo truncaría a 200 caracteres.
 */
function t_html($path) {
  $ch = curl_init(TEST_API . $path);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . t_token()],
  ]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return [$code, $raw === false ? '' : (string)$raw];
}

try {
  // El consecutivo no es una tabla volátil: se reinicia acá para que los
  // números de esta corrida sean reproducibles de un run a otro.
  $pdo->exec("UPDATE facturacion_consecutivos SET siguiente=1, activo=1");
  // Ídem con el emisor: esta suite escribe sobre la configuración fiscal,
  // así que se reponen los valores con los que se afirma más abajo.
  $pdo->exec("UPDATE configuraciones SET valor='901234567' WHERE clave='empresa.nit'");
  $pdo->exec("UPDATE configuraciones SET valor='Calle Principal # 10-20' WHERE clave='empresa.direccion'");

  // ─── 1. Semillas de la migración v9 ───────────────────────────────
  $cfg = configuraciones($pdo);
  t_ok('v9 sembró el nombre del emisor', ($cfg['empresa.nombre_comercial'] ?? '') !== '',
       'falta empresa.nombre_comercial');
  t_ok('el IVA por defecto es 19', ($cfg['facturacion.porcentaje_iva'] ?? '') === '19',
       'vale ' . var_export($cfg['facturacion.porcentaje_iva'] ?? null, true));
  t_ok('la facturación arranca activada', facturacionActiva($pdo, $cfg));

  // ─── 2. Desgranado: la unidad pura ────────────────────────────────
  $r = calcularImpuestoItem(8000, 19);
  t_ok('8000 @19% -> base 6722.69', abs($r['base'] - 6722.69) < 0.005, 'base=' . $r['base']);
  t_ok('8000 @19% -> iva 1277.31', abs($r['iva'] - 1277.31) < 0.005, 'iva=' . $r['iva']);
  t_ok('base + iva == el precio cobrado', abs($r['base'] + $r['iva'] - 8000) < 0.001);

  $r0 = calcularImpuestoItem(3500, 0);
  t_ok('producto exento: base == total y iva == 0', $r0['base'] == 3500 && $r0['iva'] == 0,
       json_encode($r0));

  // ─── 3. Caja (sin caja el cobro devuelve 409) ─────────────────────
  $code = t_code('POST', '/caja/abrir', ['montoInicial' => 50000]);
  t_ok('abrir caja -> 200', $code === 200, "HTTP $code");

  // ─── 4. Al agregar la línea queda desgranada ──────────────────────
  $prod = t_producto_con_stock(100, 8000, $pdo);
  $pid = t_crear_pedido('Mesa T-FAC-1');
  [$code] = t_agregar_item($pid, $prod['codigo'], 'Café', 1, 8000);
  t_ok('agregar ítem -> 200', $code === 200, "HTTP $code");

  $st = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? ORDER BY id');
  $st->execute([$pid]);
  $lin = $st->fetch();
  t_ok('la línea guarda base gravable', abs((float)$lin['base_gravable'] - 6722.69) < 0.01,
       'base=' . $lin['base_gravable']);
  t_ok('la línea guarda el valor del IVA', abs((float)$lin['iva_valor'] - 1277.31) < 0.01,
       'iva=' . $lin['iva_valor']);
  t_ok('la línea guarda la tarifa (19)', abs((float)$lin['iva_porcentaje'] - 19) < 0.001,
       'pct=' . $lin['iva_porcentaje']);
  t_ok('la línea guarda la unidad del producto', ($lin['unidad'] ?? '') === 'Und',
       'unidad=' . var_export($lin['unidad'] ?? null, true));
  t_ok('base + iva == subtotal de la línea',
       abs((float)$lin['base_gravable'] + (float)$lin['iva_valor'] - (float)$lin['subtotal']) < 0.001,
       "base={$lin['base_gravable']} iva={$lin['iva_valor']} sub={$lin['subtotal']}");

  // ─── 5. El encabezado cuadra con sus líneas ───────────────────────
  $st = $pdo->prepare('SELECT total, total_base, total_iva FROM pedidos WHERE id_pedido=?');
  $st->execute([$pid]);
  $ped = $st->fetch();
  t_ok('total_base del pedido == suma de las líneas',
       abs((float)$ped['total_base'] - (float)$lin['base_gravable']) < 0.01,
       "pedido={$ped['total_base']} linea={$lin['base_gravable']}");
  t_ok('total_base + total_iva == total del pedido',
       abs((float)$ped['total_base'] + (float)$ped['total_iva'] - (float)$ped['total']) < 0.001,
       "base={$ped['total_base']} iva={$ped['total_iva']} total={$ped['total']}");

  // ─── 6. Un pago parcial NO emite comprobante ──────────────────────
  $code = t_code('POST', "/pedidos/$pid/cerrar",
                 ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 4000]]]);
  t_ok('pago parcial -> 200', $code === 200, "HTTP $code");
  t_ok('pago parcial NO emite comprobante', t_num($pid, $pdo) === null,
       'numero=' . var_export(t_num($pid, $pdo), true));
  t_ok('el pedido sigue Abierto', t_estado($pid, $pdo) === 'Abierto',
       'estado=' . var_export(t_estado($pid, $pdo), true));
  t_ok('el parcial no gastó consecutivo', t_sig($pdo) === 1, 'siguiente=' . t_sig($pdo));

  // ─── 7. Cobrar el total SÍ emite, una sola vez ────────────────────
  $code = t_code('POST', "/pedidos/$pid/cerrar",
                 ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 4000]]]);
  t_ok('completar el pago -> 200', $code === 200, "HTTP $code");
  t_ok('el pedido quedó Cerrado', t_estado($pid, $pdo) === 'Cerrado',
       'estado=' . var_export(t_estado($pid, $pdo), true));

  $num1 = t_num($pid, $pdo);
  t_ok('emitió FEV-000001', $num1 === 'FEV-000001', 'numero=' . var_export($num1, true));

  $f1 = $f = t_fac($num1, $pdo);
  t_ok('la factura quedó registrada', (bool)$f1);
  if ($f1) {
    t_ok('la factura apunta al pedido facturado', $f1['id_pedido'] === $pid,
         'pedido=' . $f1['id_pedido']);
    t_ok('los totales fiscales cuadran',
         abs((float)$f1['total_base'] + (float)$f1['total_iva'] - (float)$f1['total']) < 0.001,
         "base={$f1['total_base']} iva={$f1['total_iva']} total={$f1['total']}");
    t_ok('el comprobante guardó su forma de pago', ($f1['forma_pago'] ?? '') !== '',
         'forma_pago=' . var_export($f1['forma_pago'] ?? null, true));
  }
  t_ok('un solo comprobante por pedido',
       (int)$pdo->query("SELECT COUNT(*) FROM facturas WHERE id_pedido=" . $pdo->quote($pid))->fetchColumn() === 1);

  // ─── 8. Numeración correlativa ────────────────────────────────────
  $prod2 = t_producto_con_stock(50, 5000, $pdo);
  $pid2 = t_crear_pedido('Mesa T-FAC-2');
  [$code] = t_agregar_item($pid2, $prod2['codigo'], 'Torta', 1, 5000);
  t_ok('agregar ítem (2º pedido) -> 200', $code === 200, "HTTP $code");
  $code = t_code('POST', "/pedidos/$pid2/cerrar",
                 ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 5000]]]);
  t_ok('segundo cobro -> 200', $code === 200, "HTTP $code");
  $num2 = t_num($pid2, $pdo);
  t_ok('el consecutivo avanza (FEV-000002)', $num2 === 'FEV-000002', 'numero=' . var_export($num2, true));
  t_ok('no se repitió el número', $num2 !== $num1, "num1=$num1 num2=$num2");

  // ─── 9. Emitir pendientes: no gasta números si no falta nadie ────
  [$code, $res] = t_req('POST', '/facturacion/emitir');
  t_ok('POST /facturacion/emitir -> 200', $code === 200, "HTTP $code");
  t_ok('no hay comprobantes pendientes', (int)($res['emitidas'] ?? -1) === 0,
       'emitidas=' . json_encode($res['emitidas'] ?? null));
  t_ok('el consecutivo no avanzó sin emitir', t_sig($pdo) === 3, 'siguiente=' . t_sig($pdo));

  // ─── 10. El comprobante se puede consultar ────────────────────────
  [$code, $res] = t_req('GET', "/facturacion/$num1");
  t_ok('GET /facturacion/{numero} -> 200', $code === 200, "HTTP $code");
  t_ok('devuelve la factura', ($res['factura']['numero'] ?? '') === $num1,
       'numero=' . var_export($res['factura']['numero'] ?? null, true));
  t_ok('devuelve sus líneas', !empty($res['lineas']));
  t_ok('devuelve el emisor', !empty($res['empresa']['nombre'] ?? $res['empresa']['nombre_comercial'] ?? null));
  if (!empty($res['lineas'])) {
    $l = $res['lineas'][0];
    t_ok('la línea expone base e IVA', isset($l['base'], $l['iva'], $l['ivaPct']));
    t_ok('la línea cuadra', abs($l['base'] + $l['iva'] - $l['subtotal']) < 0.01,
         "base={$l['base']} iva={$l['iva']} sub={$l['subtotal']}");
    t_ok('la línea conserva la tarifa', abs($l['ivaPct'] - 19) < 0.001, 'pct=' . $l['ivaPct']);
  }

  [$code, $res] = t_req('GET', '/facturacion');
  t_ok('GET /facturacion -> 200', $code === 200, "HTTP $code");
  t_ok('el listado trae los 2 comprobantes', (int)($res['total'] ?? -1) === 2,
       'total=' . var_export($res['total'] ?? null, true));

  // ─── 11. Un pedido facturado queda inmutable ──────────────────────
  $code = t_code('POST', "/pedidos/$pid/items", ['codigo' => $prod['codigo'], 'cantidad' => 1]);
  t_ok('agregar ítem a un pedido facturado -> 409', $code === 409, "HTTP $code");
  $code = t_code('PUT', "/pedidos/$pid", ['cliente' => 'Otro nombre']);
  t_ok('editar un pedido facturado -> 409', $code === 409, "HTTP $code");
  $code = t_code('PUT', "/pedidos/$pid", ['cliente_nit' => '999999999']);
  t_ok('tocar el NIT de un pedido facturado -> 409', $code === 409, "HTTP $code");
  $st = $pdo->prepare('SELECT cliente_nit FROM pedidos WHERE id_pedido=?');
  $st->execute([$pid]);
  t_ok('el pedido facturado sigue con su cliente original',
       $st->fetchColumn() === null, 'nit=' . var_export($st->fetchColumn(), true));

  // ─── 12. Datos fiscales del cliente ───────────────────────────────
  $pid3 = t_crear_pedido('Mesa T-FAC-3');
  [$code] = t_agregar_item($pid3, $prod['codigo'], 'Café', 1, 8000);
  t_ok('agregar ítem (3er pedido) -> 200', $code === 200, "HTTP $code");
  $code = t_code('PUT', "/pedidos/$pid3", [
    'cliente'            => 'Panadería S.A.S.',
    'cliente_nit'        => '1.234.567.890',
    'cliente_dv'         => '5',
    'cliente_direccion'  => 'Calle 10 #20-30',
  ]);
  t_ok('guardar datos fiscales -> 200', $code === 200, "HTTP $code");

  $st = $pdo->prepare('SELECT cliente_nit, cliente_dv, cliente_direccion, cliente_email FROM pedidos WHERE id_pedido=?');
  $st->execute([$pid3]);
  $cf = $st->fetch();
  t_ok('el NIT se guarda sin formato', ($cf['cliente_nit'] ?? '') === '1234567890',
       'nit=' . var_export($cf['cliente_nit'], true));
  t_ok('el DV se guarda como dígito', ($cf['cliente_dv'] ?? '') === '5',
       'dv=' . var_export($cf['cliente_dv'], true));
  t_ok('la dirección se guarda', ($cf['cliente_direccion'] ?? '') === 'Calle 10 #20-30',
       'dir=' . var_export($cf['cliente_direccion'], true));
  t_ok('el email ausente queda en NULL', $cf['cliente_email'] === null,
       'email=' . var_export($cf['cliente_email'], true));
  t_ok('formatoIdentificacion arma 1.234.567.890-5',
       formatoIdentificacion($cf['cliente_nit'], $cf['cliente_dv']) === '1.234.567.890-5',
       formatoIdentificacion($cf['cliente_nit'], $cf['cliente_dv']));

  [$code, $res] = t_req('GET', "/pedidos/$pid3");
  t_ok('GET /pedidos/{id} trae factura y emisor', $code === 200
       && array_key_exists('factura', $res) && array_key_exists('empresa', $res));
  t_ok('un pedido abierto no tiene factura todavía', ($res['factura'] ?? null) === null,
       'factura=' . json_encode($res['factura'] ?? null));
  t_ok('trae los totales fiscales del pedido', isset($res['totales']['base'], $res['totales']['iva'], $res['totales']['total']));
  t_ok('los totales expuestos cuadran',
       abs($res['totales']['base'] + $res['totales']['iva'] - $res['totales']['total']) < 0.001,
       json_encode($res['totales']));

  // ─── 13. Configuración del emisor ─────────────────────────────────
  [$code, $res] = t_req('GET', '/facturacion/config');
  t_ok('GET /facturacion/config -> 200', $code === 200, "HTTP $code");
  t_ok('trae el NIT del emisor', ($res['empresa']['nit'] ?? '') === '901234567',
       'nit=' . var_export($res['empresa']['nit'] ?? null, true));
  t_ok('trae la serie de numeración', !empty($res['serie'][0]['prefijo']),
       'serie=' . json_encode($res['serie'] ?? null));

  $code = t_code('PUT', '/facturacion/config', ['direccion' => 'Carrera 7 #40-15', 'nit' => '900.123.456']);
  t_ok('PUT /facturacion/config -> 200', $code === 200, "HTTP $code");
  [$code, $res] = t_req('GET', '/facturacion/config');
  t_ok('la nueva dirección persiste', ($res['empresa']['direccion'] ?? '') === 'Carrera 7 #40-15',
       'dir=' . var_export($res['empresa']['direccion'] ?? null, true));
  t_ok('el NIT quedó solo dígitos', ($res['empresa']['nit'] ?? '') === '900123456',
       'nit=' . var_export($res['empresa']['nit'] ?? null, true));

  // ─── 14. Anulación ────────────────────────────────────────────────
  $code = t_code('POST', "/facturacion/$num2/anular", []);
  t_ok('anular sin motivo -> 400', $code === 400, "HTTP $code");

  $code = t_code('POST', "/facturacion/$num2/anular", ['motivo' => 'Prueba de anulación']);
  t_ok('anular con motivo -> 200', $code === 200, "HTTP $code");
  $f2 = t_fac($num2, $pdo);
  t_ok('la factura quedó Anulada', ($f2['estado'] ?? '') === 'Anulada', 'estado=' . $f2['estado']);
  t_ok('guarda el motivo', ($f2['anulada_motivo'] ?? '') === 'Prueba de anulación',
       'motivo=' . var_export($f2['anulada_motivo'], true));
  t_ok('anulada conserva su número', $f2['numero'] === $num2, 'numero=' . $f2['numero']);
  t_ok('anulada sigue apuntando a su pedido', $f2['id_pedido'] === $pid2, 'pedido=' . $f2['id_pedido']);

  $code = t_code('POST', "/facturacion/$num2/anular", ['motivo' => 'otra vez']);
  t_ok('doble anulación -> 409', $code === 409, "HTTP $code");

  $code = t_code('POST', '/facturacion/FEV-999999/anular', ['motivo' => 'x']);
  t_ok('anular inexistente -> 404', $code === 404, "HTTP $code");

  // ─── 15. La anulación no libera el pedido ─────────────────────────
  t_ok('el pedido anulado no vuelve a abrirse',
       t_estado($pid2, $pdo) === 'Cerrado', 'estado=' . t_estado($pid2, $pdo));
  t_ok('el pedido anulado no gasta otro número',
       t_num($pid2, $pdo) === $num2, 'numero=' . t_num($pid2, $pdo));

  // ─── 16. Vista de impresión (segundo renderizador) ─
  [$code, $html] = t_html("/pedidos/$pid/pdf");
  t_ok('GET /pedidos/{id}/pdf -> 200', $code === 200, "HTTP $code");
  t_ok('la vista de impresión rotula FACTURA DE VENTA',
       str_contains($html, '*** FACTURA DE VENTA ***'));
  t_ok('la vista de impresión trae el número', str_contains($html, 'FEV-000001'));
  t_ok('el emisor sale de configuraciones, no hardcodeado',
       str_contains($html, 'Carrera 7 #40-15'),
       'no refleja la dirección que se guardó en PUT /facturacion/config');
  t_ok('el NIT del emisor se formatea con guion del DV',
       str_contains($html, 'NIT: 900.123.456-8'), 'no encontró el NIT formateado');
  t_ok('imprime el cliente del pedido', str_contains($html, 'TEST-AUTO'));
  t_ok('imprime la base de la línea', str_contains($html, '$6.722,69'), 'falta base 6.722,69');
  t_ok('imprime el IVA de la línea', str_contains($html, '$1.277,31'), 'falta IVA 1.277,31');
  t_ok('imprime el total con centavos', str_contains($html, '$8.000,00'), 'falta total 8.000,00');
  t_ok('suma base + IVA en la vista impresa', str_contains($html, 'Subtotal:') && str_contains($html, 'IVA 19%:'));

  // Un pedido AÚN sin comprobante no debe rotularse como factura ni mostrar número.
  [$code, $html2] = t_html("/pedidos/$pid3/pdf");
  t_ok('pedido abierto: la vista -> 200', $code === 200, "HTTP $code");
  t_ok('pedido abierto: rotula TICKET DE VENTA',
       str_contains($html2, '*** TICKET DE VENTA ***') && !str_contains($html2, '*** FACTURA DE VENTA ***'));
  t_ok('pedido abierto: sin número de comprobante', !str_contains($html2, 'No. FEV-'));
  t_ok('pedido abierto: total sin centavos', str_contains($html2, '$8.000'));

  // ─── 17. Mostrador sin cliente → CONSUMIDOR FINAL ──
  $pid4 = t_crear_pedido('Mesa T-FAC-4');
  $pdo->prepare('UPDATE pedidos SET cliente=? WHERE id_pedido=?')->execute(['', $pid4]);
  [$code] = t_agregar_item($pid4, $prod['codigo'], 'Café', 1, 8000);
  t_ok('agregar ítem (4º pedido) -> 200', $code === 200, "HTTP $code");
  $code = t_code('POST', "/pedidos/$pid4/cerrar",
                 ['pagos' => [['metodoPago' => 'Efectivo', 'monto' => 8000]]]);
  t_ok('cerrar pedido sin cliente -> 200', $code === 200, "HTTP $code");
  t_ok('el mostrador sin cliente también emite', t_num($pid4, $pdo) === 'FEV-000003',
       'numero=' . var_export(t_num($pid4, $pdo), true));

  [$code, $htmlCf] = t_html("/pedidos/$pid4/pdf");
  t_ok('comprobante sin cliente -> 200', $code === 200, "HTTP $code");
  t_ok('sin cliente imprime CONSUMIDOR FINAL', str_contains($htmlCf, 'CONSUMIDOR FINAL'));
  t_ok('sin cliente no se imprime NIT/C.C.', !str_contains($htmlCf, 'NIT/C.C.:'));

} finally {
  t_summary('facturacion');
}
