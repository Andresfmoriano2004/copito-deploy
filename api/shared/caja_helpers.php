<?php
// ─── Shared caja helpers ───────────────────────────────────────────────────

/**
 * Compute cash register summary from movements.
 */
function computeResumen($c, $movs) {
  $r = ['montoInicial' => round((float)$c['monto_inicial'], 2), 'totalVentas' => 0, 'totalIngresos' => 0, 'totalEgresos' => 0,
    'totalPropinas' => 0, 'efectivoPropinas' => 0, 'bancarioPropinas' => 0,
    'efectivoVentas' => 0, 'efectivoIngresos' => 0, 'efectivoEgresos' => 0,
    'bancarioVentas' => 0, 'bancarioIngresos' => 0, 'bancarioEgresos' => 0, 'totalFisico' => 0, 'totalBancario' => 0, 'movimientos' => []];
  foreach ($movs as $m) {
    $monto = round((float)$m['monto'], 2); $tp = $m['tipo_pago'] ?: tipoPago($m['metodo_pago']);
    $key = $tp === 'FISICO' ? 'efectivo' : 'bancario';
    if ($m['tipo'] === 'VENTA') { $r['totalVentas'] += $monto; $r[$key . 'Ventas'] += $monto; }
    elseif ($m['tipo'] === 'INGRESO') { $r['totalIngresos'] += $monto; $r[$key . 'Ingresos'] += $monto; }
    elseif ($m['tipo'] === 'EGRESO') { $r['totalEgresos'] += $monto; $r[$key . 'Egresos'] += $monto; }
    elseif ($m['tipo'] === 'PROPINA') { $r['totalPropinas'] += $monto; $r[$key . 'Propinas'] += $monto; }
    if ($m['tipo'] !== 'PROPINA') {
      $r['movimientos'][] = ['id' => (int)$m['id'], 'tipo' => $m['tipo'], 'metodoPago' => $m['metodo_pago'],
        'tipoPago' => $m['tipo_pago'], 'descripcion' => $m['descripcion'], 'monto' => $monto,
        'fecha' => $m['fecha'],
        'fechaCorta' => fmtFechaBogota($m['fecha']), 'hora' => fmtHoraBogota($m['fecha']),
        'fechaHora' => fmtFechaHoraBogota($m['fecha'])];
    }
  }
  $r['totalFisico'] = round($r['montoInicial'] + $r['efectivoVentas'] + $r['efectivoIngresos'] - $r['efectivoEgresos'], 2);
  $r['totalBancario'] = round($r['bancarioVentas'] + $r['bancarioIngresos'] - $r['bancarioEgresos'], 2);
  $r['totalEsperado'] = round($r['totalFisico'] + $r['totalBancario'], 2);
  return $r;
}

/**
 * Get tip summary for a cash register (or active one if null).
 * Returns: { totalPropinas, efectivoPropinas, bancarioPropinas, propinas: [...] }
 */
function getPropinasResumen($pdo, $cajaId = null) {
  if ($cajaId === null) {
    $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
    if (!$caja) return ['totalPropinas' => 0, 'efectivoPropinas' => 0, 'bancarioPropinas' => 0, 'propinas' => []];
    $cajaId = $caja['id'];
  }

  $stmt = $pdo->prepare(
    "SELECT cm.id, cm.monto, cm.metodo_pago, cm.tipo_pago, cm.descripcion, cm.fecha,
            p.id AS propina_id, p.id_pedido, p.lugar, p.notas AS propina_notas,
            u.nombre AS nombre_usuario, u.username AS username_usuario
     FROM caja_movimientos cm
     LEFT JOIN propinas p ON p.id_caja_mov = cm.id
     LEFT JOIN usuarios u ON u.id = cm.usuario_id
     WHERE cm.id_caja = ? AND cm.tipo = 'PROPINA'
     ORDER BY cm.fecha DESC"
  );
  $stmt->execute([$cajaId]);
  $rows = $stmt->fetchAll();

  $total = 0; $efectivo = 0; $bancario = 0; $list = [];
  foreach ($rows as $r) {
    $m = round((float)$r['monto'], 2);
    $total += $m;
    if ($r['tipo_pago'] === 'FISICO') $efectivo += $m; else $bancario += $m;
    $list[] = [
      'id'         => (int)$r['id'],
      'propinaId'  => $r['propina_id'] ? (int)$r['propina_id'] : null,
      'pedidoId'   => $r['id_pedido'] ?? null,
      'lugar'      => $r['lugar'] ?? null,
      'monto'      => $m,
      'metodoPago' => $r['metodo_pago'],
      'tipoPago'   => $r['tipo_pago'],
      'usuario'    => $r['nombre_usuario'] ?? $r['username_usuario'] ?? 'Desconocido',
      'notas'      => $r['propina_notas'] ?? $r['descripcion'] ?? '',
      'fecha'      => $r['fecha'],
      'fechaCorta' => fmtFechaBogota($r['fecha']),
      'hora'       => fmtHoraBogota($r['fecha']),
      'fechaHora'  => fmtFechaHoraBogota($r['fecha']),
    ];
  }
  return ['totalPropinas' => round($total, 2), 'efectivoPropinas' => round($efectivo, 2), 'bancarioPropinas' => round($bancario, 2), 'propinas' => $list];
}
