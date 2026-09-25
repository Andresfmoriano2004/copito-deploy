<?php
require_once __DIR__ . '/../config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();
$pdo = db();

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

// POST /api/caja/abrir
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

// POST /api/caja/movimiento
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

// GET /api/caja/propinas — uses shared helper
if ($method === 'GET' && $path === 'caja/propinas') {
  jsonResponse(getPropinasResumen($pdo));
}

jsonError('Ruta no encontrada', 404);
