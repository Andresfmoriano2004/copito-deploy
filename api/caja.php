<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();
$pdo = db();

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
    // Propinas NO se incluyen en movimientos normales para no mezclar con ventas
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

// GET /api/caja/activa
if ($method === 'GET' && $path === 'caja/activa') {
  $row = $pdo->query("SELECT * FROM caja WHERE estado='Abierta' ORDER BY id DESC LIMIT 1")->fetch();
  if (!$row) jsonResponse(null);
  jsonResponse(['id' => (int)$row['id'], 'fechaApertura' => $row['fecha_apertura'],
    'fechaAperturaCorta' => fmtFechaBogota($row['fecha_apertura']),
    'horaApertura' => fmtHoraBogota($row['fecha_apertura']),
    'fechaHoraApertura' => fmtFechaHoraBogota($row['fecha_apertura']),
    'montoInicial' => (float)$row['monto_inicial'], 'estado' => $row['estado']]);
}

// POST /api/caja/abrir (Fase 3: validación central, mismo contrato)
if ($method === 'POST' && $path === 'caja/abrir') {
  validate($body, ['montoInicial' => 'numeric|min:0']);
  $monto = round((float)($body['montoInicial'] ?? 0));
  if ($monto < 0) jsonError('El monto inicial no puede ser negativo');
  $abierta = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
  if ($abierta) jsonError('Ya hay una caja abierta');
  $stmt = $pdo->prepare('INSERT INTO caja (monto_inicial) VALUES (?)');
  $stmt->execute([$monto]);
  auditLog($authUser, 'ABRIR_CAJA', null, null, ['montoInicial' => $monto]);
  jsonResponse(['success' => true, 'mensaje' => 'Caja abierta', 'cajaId' => $pdo->lastInsertId()]);
}

// POST /api/caja/movimiento (Fase 3: validación central, mismo contrato)
if ($method === 'POST' && $path === 'caja/movimiento') {
  validate($body, ['tipo' => 'in:INGRESO,EGRESO', 'monto' => 'numeric|min:0.01', 'descripcion' => 'string|max:255']);
  $tipo = $body['tipo'] ?? '';
  $metodo = normalizarMetodoPago($body['metodoPago'] ?? 'Efectivo');
  $desc = trim($body['descripcion'] ?? '');
  $monto = round((float)($body['monto'] ?? 0));
  if (!in_array($tipo, ['INGRESO', 'EGRESO'], true) || $monto <= 0) jsonError('Tipo y monto válidos requeridos');
  $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
  if (!$caja) jsonError('No hay caja abierta');
  $tp = tipoPago($metodo);
  $stmt = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, usuario_id) VALUES (?,?,?,?,?,?,?)');
  $stmt->execute([$caja['id'], $tipo, $metodo, $tp, $desc, $monto, $authUser['id']]);
  auditLog($authUser, 'MOVIMIENTO_CAJA', null, null, ['tipo' => $tipo, 'monto' => $monto, 'metodo' => $metodo]);
  jsonResponse(['success' => true, 'mensaje' => 'Movimiento registrado en caja']);
}

// GET /api/caja/resumen
if ($method === 'GET' && $path === 'caja/resumen') {
  $caja = $pdo->query("SELECT * FROM caja WHERE estado='Abierta' ORDER BY id DESC LIMIT 1")->fetch();
  if (!$caja) jsonResponse(null);
  $movs = $pdo->prepare('SELECT * FROM caja_movimientos WHERE id_caja=?');
  $movs->execute([$caja['id']]);
  $resumen = computeResumen($caja, $movs->fetchAll());
  $resumen['id'] = (int)$caja['id'];
  $resumen['estado'] = $caja['estado'];
  $resumen['fechaApertura'] = $caja['fecha_apertura'];
  $resumen['fechaAperturaCorta'] = fmtFechaBogota($caja['fecha_apertura']);
  $resumen['horaApertura'] = fmtHoraBogota($caja['fecha_apertura']);
  $resumen['fechaHoraApertura'] = fmtFechaHoraBogota($caja['fecha_apertura']);
  jsonResponse($resumen);
}

// POST /api/caja/cerrar
if ($method === 'POST' && $path === 'caja/cerrar') {
  $montoFisico = round((float)($body['montoFisico'] ?? 0));
  $notas = trim($body['notas'] ?? '');
  if ($montoFisico < 0) jsonError('El monto físico no puede ser negativo');
  if (mb_strlen($notas) > 500) jsonError('Las notas no pueden exceder 500 caracteres');

  $caja = $pdo->query("SELECT * FROM caja WHERE estado='Abierta' ORDER BY id DESC LIMIT 1")->fetch();
  if (!$caja) jsonError('No hay caja abierta');
  $movs = $pdo->prepare('SELECT * FROM caja_movimientos WHERE id_caja=?');
  $movs->execute([$caja['id']]);
  $r = computeResumen($caja, $movs->fetchAll());
  $diferencia = round($montoFisico - $r['totalFisico'], 2);
  $pdo->prepare('UPDATE caja SET fecha_cierre=NOW(), monto_esperado=?, monto_fisico=?, diferencia=?, estado=?, notas=? WHERE id=?')->execute([$r['totalEsperado'], $montoFisico, $diferencia, 'Cerrada', $notas, $caja['id']]);
  auditLog($authUser, 'CERRAR_CAJA', null, null, ['cajaId' => $caja['id'], 'montoEsperado' => $r['totalEsperado'], 'montoFisico' => $montoFisico, 'diferencia' => $diferencia, 'notas' => $notas]);
  jsonResponse(['success' => true, 'mensaje' => 'Caja cerrada', 'resumen' => [
    'montoInicial' => $r['montoInicial'], 'totalVentas' => $r['totalVentas'],
    'totalIngresos' => $r['totalIngresos'], 'totalEgresos' => $r['totalEgresos'],
    'totalFisico' => $r['totalFisico'], 'totalBancario' => $r['totalBancario'],
    'montoEsperado' => $r['totalEsperado'], 'montoFisico' => $montoFisico, 'diferencia' => $diferencia,
    'notas' => $notas
  ]]);
}

// GET /api/caja/historial
if ($method === 'GET' && $path === 'caja/historial') {
  $rows = $pdo->query("SELECT * FROM caja WHERE estado='Cerrada' ORDER BY fecha_cierre DESC LIMIT 30")->fetchAll();
  $movStmt = $pdo->prepare('SELECT * FROM caja_movimientos WHERE id_caja=?');
  jsonResponse(array_map(function($r) use ($pdo, $movStmt) {
    // Desglose físico/bancario calculado de movimientos (la tabla caja solo guarda agregados)
    $movStmt->execute([$r['id']]);
    $res = computeResumen($r, $movStmt->fetchAll());
    return [
    'id' => (int)$r['id'], 'fechaApertura' => $r['fecha_apertura'], 'fechaCierre' => $r['fecha_cierre'],
    'fechaAperturaCorta' => fmtFechaBogota($r['fecha_apertura']),
    'horaApertura' => fmtHoraBogota($r['fecha_apertura']),
    'fechaHoraApertura' => fmtFechaHoraBogota($r['fecha_apertura']),
    'fechaCierreCorta' => fmtFechaBogota($r['fecha_cierre']),
    'horaCierre' => fmtHoraBogota($r['fecha_cierre']),
    'fechaHoraCierre' => fmtFechaHoraBogota($r['fecha_cierre']),
    'montoInicial' => (float)$r['monto_inicial'], 'montoEsperado' => (float)$r['monto_esperado'],
    'montoFisico' => (float)$r['monto_fisico'], 'diferencia' => (float)$r['diferencia'], 'notas' => $r['notas'] ?? '',
    'totalFisico' => $res['totalFisico'], 'totalBancario' => $res['totalBancario'],
    'totalVentas' => $res['totalVentas'], 'efectivoVentas' => $res['efectivoVentas'], 'bancarioVentas' => $res['bancarioVentas']
  ]; }, $rows));
}

// GET /api/caja/propinas
// Lista los movimientos tipo PROPINA de la caja activa con detalle de mesa/pedido/usuario.
if ($method === 'GET' && $path === 'caja/propinas') {
  $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
  if (!$caja) jsonResponse(['totalPropinas' => 0, 'efectivoPropinas' => 0, 'bancarioPropinas' => 0, 'propinas' => []]);

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
  $stmt->execute([$caja['id']]);
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
  jsonResponse(['totalPropinas' => round($total,2), 'efectivoPropinas' => round($efectivo,2), 'bancarioPropinas' => round($bancario,2), 'propinas' => $list]);
}

jsonError('Ruta no encontrada', 404);
