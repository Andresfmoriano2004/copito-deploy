<?php
require_once __DIR__ . '/../config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$pdo = db();

// GET /api/auditoria — COLABORADOR → OPERACIÓN → PEDIDO/MESA → FECHA/HORA
// admin ve todo; vendedor solo sus propias operaciones.
if ($method === 'GET' && $path === 'auditoria') {
  $pg = pageParams(100, 500);
  $where = '1=1'; $params = [];

  if ($authUser['rol'] !== 'admin') { $where .= ' AND a.usuario_id=?'; $params[] = $authUser['id']; }
  elseif (!empty($_GET['usuario_id'])) { $where .= ' AND a.usuario_id=?'; $params[] = (int)$_GET['usuario_id']; }
  if (!empty($_GET['pedido_id'])) { $where .= ' AND a.pedido_id=?'; $params[] = $_GET['pedido_id']; }
  if (!empty($_GET['operacion'])) { $where .= ' AND a.operacion=?'; $params[] = $_GET['operacion']; }
  if (!empty($_GET['desde'])) { $where .= ' AND a.fecha>=?'; $params[] = $_GET['desde']; }
  if (!empty($_GET['hasta'])) { $where .= ' AND a.fecha<=?'; $params[] = $_GET['hasta'] . ' 23:59:59'; }

  $mapAud = fn($r) => [
    'id' => (int)$r['id'], 'usuarioId' => (int)$r['usuario_id'],
    'usuario' => $r['usuario_nombre'] ?? '', 'codigoReferencia' => $r['codigo_referencia'],
    'operacion' => $r['operacion'], 'pedidoId' => $r['pedido_id'], 'mesa' => $r['mesa'],
    'detalle' => $r['detalle'] ? json_decode($r['detalle'], true) : null, 'fecha' => $r['fecha'],
    'fechaCorta' => fmtFechaBogota($r['fecha']), 'hora' => fmtHoraBogota($r['fecha']),
    'fechaHora' => fmtFechaHoraBogota($r['fecha'])
  ];
  // Fase 2: ?page= activa {data,total,page,limit}; legacy array con ?offset&limit.
  if ($pg['hasPaging']) {
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM auditoria a WHERE $where");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();
    $stmt = $pdo->prepare("SELECT a.*, u.nombre AS usuario_nombre FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE $where ORDER BY a.fecha DESC, a.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}");
    $stmt->execute($params);
    pagedResponse(array_map($mapAud, $stmt->fetchAll()), $total, $pg['page'], $pg['limit']);
  }
  $offset = max(0, (int)($_GET['offset'] ?? 0));
  $limit = min(500, max(1, (int)($_GET['limit'] ?? 100)));

  $stmt = $pdo->prepare("SELECT a.*, u.nombre AS usuario_nombre FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE $where ORDER BY a.fecha DESC, a.id DESC LIMIT $limit OFFSET $offset");
  $stmt->execute($params);
  jsonResponse(array_map($mapAud, $stmt->fetchAll()));
}

jsonError('Ruta no encontrada', 404);
