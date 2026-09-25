<?php
require_once __DIR__ . '/../config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path   = $_GET['route'] ?? '';
$body   = jsonBody();
$pdo    = db();

// --- POST /api/propinas ----------------------------------
// Registra una propina independiente. Si va asociada a un pedido, valida
// que ese pedido exista y est� Cerrado (saldo = $0). Si no lleva pedido,
// se registra como propina general.
if ($method === 'POST' && $path === 'propinas') {
  $monto     = round((float)($body['monto']     ?? 0), 2);
  $metodo    = normalizarMetodoPago($body['metodoPago'] ?? 'Efectivo');
  $pedidoId  = !empty($body['pedidoId'])  ? trim($body['pedidoId'])  : null;
  $lugar     = !empty($body['lugar'])     ? trim($body['lugar'])     : null;
  $notas     = !empty($body['notas'])     ? trim($body['notas'])     : null;

  if ($monto <= 0)              jsonError('El monto de la propina debe ser mayor a cero');
  if ($monto > 99999999)        jsonError('El monto de la propina excede el m�ximo permitido');
  if (!validarMetodoPago($metodo)) jsonError('M�todo de pago inv�lido. Use Efectivo o Transferencia');

  // Si se asocia a un pedido, validar que exista y est� Cerrado
  if ($pedidoId !== null) {
    $pedRow = $pdo->prepare('SELECT estado, lugar FROM pedidos WHERE id_pedido=?');
    $pedRow->execute([$pedidoId]);
    $ped = $pedRow->fetch();
    if (!$ped) jsonError('Pedido no encontrado', 404);
    if ($ped['estado'] !== 'Cerrado') jsonError('El pedido a�n no ha sido pagado por completo. Registre la propina una vez el saldo sea $0');
    if (!$lugar) $lugar = $ped['lugar'];
  }

  $pdo->beginTransaction();
  try {
    // 1. Registrar en caja_movimientos como tipo PROPINA (si hay caja abierta)
    $cajaMovId = null;
    $caja = $pdo->query("SELECT id FROM caja WHERE estado='Abierta' LIMIT 1")->fetch();
    if ($caja) {
      $tipoPago = ($metodo === 'Efectivo') ? 'FISICO' : 'BANCARIO';
      $descCaja = $pedidoId ? "Propina - Pedido $pedidoId" . ($lugar ? " ($lugar)" : '') : 'Propina general' . ($lugar ? " ($lugar)" : '');
      $stmtCaja = $pdo->prepare('INSERT INTO caja_movimientos (id_caja, tipo, metodo_pago, tipo_pago, descripcion, monto, id_pedido, usuario_id) VALUES (?,?,?,?,?,?,?,?)');
      $stmtCaja->execute([$caja['id'], 'PROPINA', $metodo, $tipoPago, $descCaja, $monto, $pedidoId, $authUser['id']]);
      $cajaMovId = (int)$pdo->lastInsertId();
    }

    // 2. Registrar en tabla propinas
    $stmtProp = $pdo->prepare('INSERT INTO propinas (id_pedido, lugar, monto, metodo_pago, usuario_id, id_caja_mov, notas) VALUES (?,?,?,?,?,?,?)');
    $stmtProp->execute([$pedidoId, $lugar, $monto, $metodo, $authUser['id'], $cajaMovId, $notas]);
    $propinaId = (int)$pdo->lastInsertId();

    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_PROPINA', $pedidoId, $lugar, ['monto' => $monto, 'metodo' => $metodo]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError($e->getMessage(), 500);
  }

  $desc = $pedidoId ? "Propina de Pedido $pedidoId" : 'Propina general';
  if ($lugar) $desc .= " ($lugar)";
  jsonResponse(['success' => true, 'mensaje' => "$desc registrada por $" . number_format($monto, 0, ',', '.'), 'propinaId' => $propinaId]);
}

// --- GET /api/propinas -----------------------------------
// Lista propinas con filtros opcionales: fecha_desde, fecha_hasta, lugar, usuario_id
if ($method === 'GET' && $path === 'propinas') {
  $where  = [];
  $params = [];

  $desde = $_GET['fecha_desde'] ?? '';
  $hasta = $_GET['fecha_hasta'] ?? '';
  $lugar = $_GET['lugar'] ?? '';
  $uid   = isset($_GET['usuario_id']) ? (int)$_GET['usuario_id'] : null;

  if ($desde) { $where[] = 'p.fecha >= ?'; $params[] = $desde . ' 00:00:00'; }
  if ($hasta) { $where[]  = 'p.fecha <= ?'; $params[] = $hasta . ' 23:59:59'; }
  if ($lugar) { $where[]  = 'p.lugar = ?';  $params[] = $lugar; }
  if ($uid)   { $where[]  = 'p.usuario_id = ?'; $params[] = $uid; }

  $sql = 'SELECT p.*, u.nombre AS nombre_usuario, u.username AS username_usuario
          FROM propinas p
          LEFT JOIN usuarios u ON u.id = p.usuario_id'
         . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
         . ' ORDER BY p.fecha DESC LIMIT 500';

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll();

  jsonResponse(array_map(fn($r) => [
    'id'         => (int)$r['id'],
    'pedidoId'   => $r['id_pedido'] ?? null,
    'lugar'      => $r['lugar'] ?? null,
    'monto'      => (float)$r['monto'],
    'metodoPago' => $r['metodo_pago'],
    'usuarioId'  => $r['usuario_id'] ? (int)$r['usuario_id'] : null,
    'usuario'    => $r['nombre_usuario'] ?? $r['username_usuario'] ?? 'Desconocido',
    'notas'      => $r['notas'] ?? '',
    'fecha'      => $r['fecha'],
    'fechaCorta' => fmtFechaBogota($r['fecha']),
    'hora'       => fmtHoraBogota($r['fecha']),
    'fechaHora'  => fmtFechaHoraBogota($r['fecha']),
  ], $rows));
}

// --- GET /api/propinas/resumen ---------------------------
// Total de propinas de la caja activa (desglose físico/bancario)
if ($method === 'GET' && $path === 'propinas/resumen') {
  jsonResponse(getPropinasResumen($pdo));
}
