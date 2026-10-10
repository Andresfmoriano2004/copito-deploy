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
  requireRole('admin');
  validate($body, ['montoInicial' => 'numeric|min:0']);
  $monto = round((float)($body['montoInicial'] ?? 0), 2);
  if ($monto < 0) jsonError('El monto inicial no puede ser negativo');
  $pdo->beginTransaction();
  try {
    // FOR UPDATE serializa dos aperturas simultáneas (evita 2 cajas "Abiertas")
    $abierta = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1 FOR UPDATE")->fetch();
    if ($abierta) { $pdo->rollBack(); jsonError('Ya hay una caja abierta'); }
    $stmt = $pdo->prepare('INSERT INTO caja (monto_inicial) VALUES (?)');
    $stmt->execute([$monto]);
    $cajaId = $pdo->lastInsertId();
    auditLog($authUser, 'ABRIR_CAJA', null, null, ['montoInicial' => $monto]);
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error abriendo caja: ' . $e->getMessage());
    jsonError('No se pudo abrir la caja', 500);
  }
  jsonResponse(['success' => true, 'mensaje' => 'Caja abierta', 'cajaId' => (int)$cajaId]);
}

// POST /api/caja/movimiento
if ($method === 'POST' && $path === 'caja/movimiento') {
  requireRole('admin');
  validate($body, ['tipo' => 'in:INGRESO,EGRESO', 'monto' => 'numeric|min:0.01', 'descripcion' => 'string|max:255']);
  $tipo = $body['tipo'] ?? '';
  $metodo = normalizarMetodoPago($body['metodoPago'] ?? 'Efectivo');
  $desc = trim($body['descripcion'] ?? '');
  $monto = round((float)($body['monto'] ?? 0), 2);
  if (!in_array($tipo, ['INGRESO', 'EGRESO'], true) || $monto <= 0) jsonError('Tipo y monto válidos requeridos');
  $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
  if (!$caja) jsonError('No hay caja abierta');
  $tp = tipoPago($metodo);
  $pdo->beginTransaction();
  try {
    // Bloquea la fila de caja: serializa contra un cierre simultáneo
    $lock = $pdo->prepare("SELECT id FROM caja WHERE id=? AND estado='Abierta' FOR UPDATE");
    $lock->execute([$caja['id']]);
    if (!$lock->fetchColumn()) { $pdo->rollBack(); jsonError('La caja ya no está abierta', 409); }
    $stmt = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, usuario_id) VALUES (?,?,?,?,?,?,?)');
    $stmt->execute([$caja['id'], $tipo, $metodo, $tp, $desc, $monto, $authUser['id']]);
    auditLog($authUser, 'MOVIMIENTO_CAJA', null, null, ['tipo' => $tipo, 'monto' => $monto, 'metodo' => $metodo]);
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error registrando movimiento de caja: ' . $e->getMessage());
    jsonError('No se pudo registrar el movimiento', 500);
  }
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
  requireRole('admin');
  $montoFisico = round((float)($body['montoFisico'] ?? 0), 2);
  $notas = trim($body['notas'] ?? '');
  if ($montoFisico < 0) jsonError('El monto físico no puede ser negativo');
  if (mb_strlen($notas) > 500) jsonError('Las notas no pueden exceder 500 caracteres');

  $caja = $pdo->query("SELECT * FROM caja WHERE estado='Abierta' ORDER BY id DESC LIMIT 1")->fetch();
  if (!$caja) jsonError('No hay caja abierta');

  $pdo->beginTransaction();
  try {
    // Bloquea la caja mientras se calculan los totales: evita que entre un
    // movimiento a mitad de cálculo y el arqueo cierre con cifras viejas.
    $lock = $pdo->prepare("SELECT id FROM caja WHERE id=? AND estado='Abierta' FOR UPDATE");
    $lock->execute([$caja['id']]);
    if (!$lock->fetchColumn()) { $pdo->rollBack(); jsonError('La caja ya no está abierta', 409); }

    $movs = $pdo->prepare('SELECT * FROM caja_movimientos WHERE id_caja=?');
    $movs->execute([$caja['id']]);
    $r = computeResumen($caja, $movs->fetchAll());
    $diferencia = round($montoFisico - $r['totalFisico'], 2);
    $pdo->prepare('UPDATE caja SET fecha_cierre=NOW(), monto_esperado=?, monto_fisico=?, diferencia=?, estado=?, notas=? WHERE id=?')->execute([$r['totalEsperado'], $montoFisico, $diferencia, 'Cerrada', $notas, $caja['id']]);
    auditLog($authUser, 'CERRAR_CAJA', null, null, ['cajaId' => $caja['id'], 'montoEsperado' => $r['totalEsperado'], 'montoFisico' => $montoFisico, 'diferencia' => $diferencia, 'notas' => $notas]);
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Copito error cerrando caja: ' . $e->getMessage());
    jsonError('No se pudo cerrar la caja', 500);
  }

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
