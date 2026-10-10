<?php
// ─── Facturación — Comprobante de venta ("Camino A") ────────────────────────
//
// Alcance de esta versión:
//   · Prefijo + consecutivo propios (sin resolución DIAN ni CUFE/TrackID).
//   · IVA desgranado desde precios que YA lo incluyen.
//   · Emisión automática única por pedido al quedar 100% pagado.
//
// Toda función de este archivo asume que corre DENTRO de la transacción que
// cierra el pedido: así el número de factura se reserva con FOR UPDATE y no
// puede repetirse si dos cajas cierran a la vez.

// (Todas las funciones de este archivo se cargan vía api/config.php, que ya
// require_once el resto de shared/.)

// ═══ Impuestos ═════════════════════════════════════════════════════════════

/**
 * Desgrana un total que YA INCLUYE el IVA.
 *
 * `productos.precio` es lo que paga el cliente (decisión de negocio), así que:
 *     base = round(total / (1 + iva/100), 2)
 *     iva  = round(total - base, 2)
 *
 * El IVA se obtiene POR RESTA y no volviendo a multiplicar, de modo que
 * base + iva == total exactamente. Si se calculara como base*iva/100 se
 * podría perder o ganar un centavo por ítem y el comprobante no cuadraría.
 *
 * @param float $totalConIva  subtotal de la línea, con IVA incluido
 * @param float $porcentajeIva p.ej. 19
 * @return array{base: float, iva: float, pct: float}
 */
function calcularImpuestoItem($totalConIva, $porcentajeIva) {
  $pct = (float)$porcentajeIva;
  if ($pct < 0) $pct = 0;
  $total = round((float)$totalConIva, 2);
  $base = $pct > 0 ? round($total / (1 + $pct / 100), 2) : $total;
  return [
    'base' => $base,
    'iva'  => round($total - $base, 2),
    'pct'  => $pct,
  ];
}

/**
 * Suma fiscal de las líneas de un pedido (en Centavos exactos, 2 decimales).
 *
 * @return array{base: float, iva: float, descuentos: float, total: float}
 */
function totalesFiscalesPedido($pdo, $idPedido) {
  $st = $pdo->prepare(
    'SELECT COALESCE(SUM(base_gravable),0) AS base,
            COALESCE(SUM(iva_valor),0)      AS iva,
            COALESCE(SUM(subtotal),0)       AS total
     FROM detalle_pedido WHERE id_pedido=?'
  );
  $st->execute([$idPedido]);
  $r = $st->fetch() ?: [];
  $desc = $pdo->prepare('SELECT COALESCE(total_descuentos,0) FROM pedidos WHERE id_pedido=?');
  $desc->execute([$idPedido]);
  $descuentos = round((float)($desc->fetchColumn() ?: 0), 2);
  return [
    'base'       => round((float)($r['base'] ?? 0), 2),
    'iva'        => round((float)($r['iva'] ?? 0), 2),
    'descuentos' => $descuentos,
    'total'      => round((float)($r['total'] ?? 0), 2),
  ];
}

// ═══ Configuración del emisor ══════════════════════════════════════════════

/**
 * Lee toda la tabla `configuraciones` en UNA consulta.
 *
 * Si la migración v9 todavía no está aplicada devuelve [] y la API sigue
 * funcionando: la facturación simplemente queda apagada.
 */
function configuraciones($pdo) {
  try {
    $out = [];
    foreach ($pdo->query('SELECT clave, valor FROM configuraciones') as $r) {
      $out[$r['clave']] = $r['valor'];
    }
    return $out;
  } catch (Throwable $e) {
    return [];
  }
}

/**
 * Valor de una clave con su defecto.
 * @param array|null $todas precargado con configuraciones() para evitar N consultas
 */
function configVal($clave, $defecto = '', $todas = null) {
  if (is_array($todas) && array_key_exists($clave, $todas)) {
    $v = $todas[$clave];
  } else {
    $v = null;
  }
  if ($v === null || $v === '') return $defecto;
  return $v;
}

/**
 * Datos del emisor para el encabezado del comprobante.
 * Sustituye el hardcodeo que había en js/ticket.js:7-15 y pedidos_detail.php:89-93.
 */
function empresaFactura($pdo, $todas = null) {
  $todas = is_array($todas) ? $todas : configuraciones($pdo);
  return [
    'nombre'    => configVal('empresa.nombre_comercial', 'Dark Pink Coffee', $todas),
    'razon'     => configVal('empresa.razon_social', 'Dark Pink Coffee', $todas),
    'subtitulo' => configVal('empresa.subtitulo', '', $todas),
    'nit'       => configVal('empresa.nit', '', $todas),
    'dv'        => configVal('empresa.dv', '', $todas),
    'direccion' => configVal('empresa.direccion', '', $todas),
    'ciudad'    => configVal('empresa.ciudad', '', $todas),
    'telefono'  => configVal('empresa.telefono', '', $todas),
    'regimen'   => configVal('empresa.regimen', '', $todas),
    'actividad' => configVal('empresa.actividad_economica', '', $todas),
    'pie'       => configVal('empresa.mensaje_pie', '¡Gracias por su visita!', $todas),
    'pie2'      => configVal('empresa.pie_secundario', 'Vuelva pronto ☕', $todas),
  ];
}

/** ¿La facturación está encendida? */
function facturacionActiva($pdo, $todas = null) {
  return configVal('facturacion.activo', '0', $todas) === '1';
}

/**
 * Formatea un NIT o cédula colombiana: 901234567 + dv 8 → 901.234.567-8
 * Se agrupan de 3 en 3; el dígito de verificación se pone aparte con guion.
 */
function formatoIdentificacion($numero, $dv = null) {
  $d = preg_replace('/\D/', '', (string)$numero);
  if ($d === '') return '';
  $g = preg_replace('/\B(?=(\d{3})+(?!\d))/', '.', $d);
  $dvL = preg_replace('/\D/', '', (string)$dv);
  return $dvL !== '' ? $g . '-' . $dvL : $g;
}

/**
 * Normaliza una identificación capturada por el cajero a SOLO dígitos.
 *
 * El POS permite escribir "1.234.567.890" o "CE 1234567": aquí se guarda el
 * número limpio y formato con puntos/guion lo arma la factura al imprimir.
 * Devuelve null si no quedó ningún dígito (consumidor final).
 */
function normalizarIdentificacion($valor, $maxDigitos = 15) {
  $d = preg_replace('/\D/', '', (string)$valor);
  if ($d === '') return null;
  return substr($d, 0, $maxDigitos);
}

/**
 * Datos fiscales del cliente que envía el POS, ya saneados y recortados al
 * tamaño real de cada columna. Ausente o vacío → null.
 *
 * No incluye `forma_pago`: la fija el negocio (Contado) y un UPDATE parcial
 * no debe poder sobrescribirla con null.
 *
 * ATENCIÓN: devuelve una clave por campo. Quien llame debe filtrar con
 * `array_key_exists()` sobre el body, o un PUT que no trae `cliente_email`
 * terminaría borrando el que ya estaba guardado.
 */
function datosClienteFiscal(array $body) {
  $txt = function ($clave, $max) use ($body) {
    if (!isset($body[$clave]) || $body[$clave] === '') return null;
    return mb_substr((string)$body[$clave], 0, $max);
  };
  return [
    'cliente_nit'       => normalizarIdentificacion($body['cliente_nit'] ?? ''),
    'cliente_dv'        => normalizarIdentificacion($body['cliente_dv'] ?? '', 1),
    'cliente_direccion' => $txt('cliente_direccion', 200),
    'cliente_email'     => $txt('cliente_email', 150),
    'cliente_regimen'   => $txt('cliente_regimen', 30),
  ];
}

// ═══ Numeración ════════════════════════════════════════════════════════════

/**
 * Prefijo activo de facturación. Si no hay ninguno configurado devuelve null
 * y la emisión queda pendiente (mejor no facturar que facturar mal).
 *
 * Debe llamarse con la transacción ya abierta: bloquea la fila FOR UPDATE para
 * que dos cajas simultáneas no se asignen el mismo número.
 */
function prefijoActivo($pdo) {
  $st = $pdo->query("SELECT prefijo, siguiente, numero_hasta, activo
                     FROM facturacion_consecutivos WHERE activo=1
                     ORDER BY vigencia_desde IS NULL, vigencia_desde DESC LIMIT 1");
  $row = $st->fetch();
  if (!$row) return null;
  if ((int)$row['siguiente'] > (int)$row['numero_hasta']) return null;
  return $row;
}

/**
 * Reserva el siguiente número y lo deja reservado (incrementa `siguiente`).
 * Devuelve ['prefijo','numero','consecutivo'] o null si la serie se agotó.
 */
function reservarNumeroFactura($pdo) {
  $st = $pdo->query("SELECT prefijo, siguiente, numero_hasta, activo
                     FROM facturacion_consecutivos WHERE activo=1
                     ORDER BY vigencia_desde IS NULL, vigencia_desde DESC LIMIT 1
                     FOR UPDATE");
  $row = $st->fetch();
  if (!$row) return null;
  $n = (int)$row['siguiente'];
  if ($n > (int)$row['numero_hasta']) return null;

  $upd = $pdo->prepare('UPDATE facturacion_consecutivos SET siguiente = siguiente + 1 WHERE prefijo=?');
  $upd->execute([$row['prefijo']]);

  return [
    'prefijo'     => $row['prefijo'],
    'consecutivo' => $n,
    'numero'      => $row['prefijo'] . '-' . str_pad((string)$n, 6, '0', STR_PAD_LEFT),
  ];
}

// ═══ Consulta ══════════════════════════════════════════════════════════════

/**
 * Comprobante de un pedido, o null si todavía no se emitió.
 *
 * Devuelve null sin reventar si la migración v9 aún no está aplicada, para
 * que /pedidos/{id} siga sirviendo el pedido aunque falte facturación.
 */
function facturaDelPedido($pdo, $idPedido) {
  try {
    $st = $pdo->prepare('SELECT * FROM facturas WHERE id_pedido=?');
    $st->execute([$idPedido]);
    $f = $st->fetch();
    if (!$f) return null;

    // Datos de la serie, que es lo que un comprobante Camino A debe mostrar
    // debajo del número (resolución interna y vigencia de la numeración).
    $serie = null;
    try {
      $s = $pdo->prepare('SELECT resolucion, vigencia_desde, vigencia_hasta
                          FROM facturacion_consecutivos WHERE prefijo=?');
      $s->execute([$f['prefijo']]);
      $serie = $s->fetch() ?: null;
    } catch (Throwable $e) {
      $serie = null;
    }

    return [
      'numero'           => $f['numero'],
      'prefijo'          => $f['prefijo'],
      'consecutivo'      => (int)$f['consecutivo'],
      'fechaEmision'     => $f['fecha_emision'],
      // Ya formateada en Bogotá por el backend: el ticket la imprime tal cual
      // en vez de re-parsearla con la zona horaria del navegador.
      'fechaEmisionFmt'  => fmtFechaHoraBogota($f['fecha_emision']),
      'estado'           => $f['estado'],
      'totalBase'        => round((float)$f['total_base'], 2),
      'totalDescuentos'  => round((float)$f['total_descuentos'], 2),
      'totalIva'         => round((float)$f['total_iva'], 2),
      'total'            => round((float)$f['total'], 2),
      'formaPago'        => $f['forma_pago'],
      'emitidaPor'       => $f['emitida_por'],
      'anuladaMotivo'    => $f['anulada_motivo'],
      'resolucion'       => $serie ? ($serie['resolucion'] ?? null) : null,
      'vigenciaDesde'    => $serie ? ($serie['vigencia_desde'] ?? null) : null,
      'vigenciaHasta'    => $serie ? ($serie['vigencia_hasta'] ?? null) : null,
    ];
  } catch (Throwable $e) {
    return null;
  }
}

// ═══ Emisión ═══════════════════════════════════════════════════════════════

/**
 * Emite el comprobante de un pedido ya CERRADO.
 *
 * Idempotente: si el pedido ya tiene número devuelve la factura existente y no
 * gasta consecutivo. Devuelve:
 *   ['emitida' => bool, 'factura' => array|null, 'motivo' => string|null]
 *
 * Se invoca desde closeOrderIfPaid() y desde pedidos_pay.php, es decir dentro
 * de la transacción que cierra el pedido: o el pedido queda cerrado CON número,
 * o no queda cerrado.
 */
function emitirFactura($pdo, $idPedido, $usuarioId = null, $todas = null) {
  $st = $pdo->prepare('SELECT * FROM pedidos WHERE id_pedido=? FOR UPDATE');
  $st->execute([$idPedido]);
  $ped = $st->fetch();
  if (!$ped) return ['emitida' => false, 'factura' => null, 'motivo' => 'Pedido no encontrado'];

  // Ya emitida: no tocar nada (evita gastar consecutivos en reintentos).
  if (!empty($ped['numero_factura'])) {
    $ex = $pdo->prepare('SELECT * FROM facturas WHERE numero=?');
    $ex->execute([$ped['numero_factura']]);
    $f = $ex->fetch();
    return ['emitida' => true, 'factura' => $f ?: null, 'motivo' => null];
  }

  if ($ped['estado'] !== 'Cerrado') {
    return ['emitida' => false, 'factura' => null, 'motivo' => 'El pedido aún no está cerrado'];
  }

  $todas = is_array($todas) ? $todas : configuraciones($pdo);
  if (!facturacionActiva($pdo, $todas)) {
    return ['emitida' => false, 'factura' => null, 'motivo' => 'Facturación desactivada'];
  }

  // Todo lo que puede fallar se calcula ANTES de reservar el número: si algo
  // revienta aquí no se gasta un consecutivo ni queda un hueco en la serie.
  $tot = totalesFiscalesPedido($pdo, $idPedido);

  $numero = reservarNumeroFactura($pdo);
  if (!$numero) {
    return ['emitida' => false, 'factura' => null, 'motivo' => 'No hay serie de numeración activa'];
  }

  $ins = $pdo->prepare(
    'INSERT INTO facturas
       (numero, prefijo, consecutivo, id_pedido, fecha_emision, estado, lugar,
        forma_pago, cliente_nombre, cliente_nit, cliente_dv, cliente_direccion,
        cliente_email, cliente_regimen, total_base, total_descuentos, total_iva,
        total, emitida_por)
     VALUES (?,?,?,?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  );
  $ins->execute([
    $numero['numero'], $numero['prefijo'], $numero['consecutivo'], $idPedido, 'Emitida',
    $ped['lugar'],
    $ped['forma_pago'] ?: 'Contado',
    ($ped['cliente'] !== '' ? $ped['cliente'] : null),
    $ped['cliente_nit'], $ped['cliente_dv'], $ped['cliente_direccion'],
    $ped['cliente_email'], $ped['cliente_regimen'],
    $tot['base'], $tot['descuentos'], $tot['iva'], $tot['total'],
    $usuarioId,
  ]);

  $pdo->prepare('UPDATE pedidos SET numero_factura=? WHERE id_pedido=?')
      ->execute([$numero['numero'], $idPedido]);

  $sel = $pdo->prepare('SELECT * FROM facturas WHERE numero=?');
  $sel->execute([$numero['numero']]);
  return ['emitida' => true, 'factura' => $sel->fetch(), 'motivo' => null];
}

/**
 * Se llama en los puntos donde un pedido pasa a 'Cerrado'.
 * Nunca lanza excepción hacia el flujo de pago: si no puede facturar lo deja
 * anotado en el log y el pedido sigue cobrándose (ya existe un "emitir" manual
 * para ponerse al día).
 */
function emitirFacturaSiCorresponde($pdo, $idPedido, $usuarioId = null) {
  try {
    return emitirFactura($pdo, $idPedido, $usuarioId);
  } catch (Throwable $e) {
    error_log('facturacion: no se pudo emitir ' . $idPedido . ': ' . $e->getMessage());
    return ['emitida' => false, 'factura' => null, 'motivo' => $e->getMessage()];
  }
}
