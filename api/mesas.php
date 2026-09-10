<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();
$pdo = db();

if ($method === 'GET' && $path === 'mesas') {
  // Estado derivado (fuente de verdad: pedidos): Ocupada = pedido abierto sin
  // pagos; En pago = pedido abierto con pagos parciales; Reservada = marca
  // manual del admin sin pedido abierto; Disponible = resto.
  $rows = $pdo->query("SELECT m.*, p.id_pedido, p.estado AS pedido_estado, p.total,
      COALESCE((SELECT SUM(monto) FROM pagos WHERE id_pedido=p.id_pedido),0) AS total_pagado
    FROM mesas m LEFT JOIN pedidos p ON p.lugar=m.nombre AND p.estado='Abierto'
    ORDER BY m.orden, m.id")->fetchAll();
  jsonResponse(array_map(function($r) {
    $total = $r['total'] !== null ? (float)$r['total'] : 0;
    $pagado = (float)($r['total_pagado'] ?? 0);
    if ($r['id_pedido']) $estado = $pagado > 0 ? 'En pago' : 'Ocupada';
    else $estado = ($r['estado_manual'] ?? 'Disponible') === 'Reservada' ? 'Reservada' : 'Disponible';
    return [
      'id' => (int)$r['id'], 'nombre' => $r['nombre'], 'capacidad' => (int)$r['capacidad'],
      'posX' => (int)$r['pos_x'], 'posY' => (int)$r['pos_y'],
      'estado' => $estado,
      'pedidoId' => $r['id_pedido'], 'total' => $total,
      'totalPagado' => $pagado, 'saldo' => max(0, $total - $pagado)
    ];
  }, $rows));
}

if ($method === 'PUT' && preg_match('#^mesas/(\d+)$#', $path, $m)) {
  requireRole('admin');
  $sets = []; $values = [];
  foreach (['nombre', 'capacidad'] as $field) {
    if (isset($body[$field])) { $sets[] = "$field=?"; $values[] = $field === 'capacidad' ? max(1, (int)$body[$field]) : trim($body[$field]); }
  }
  foreach (['posX' => 'pos_x', 'posY' => 'pos_y'] as $input => $column) {
    if (isset($body[$input])) { $sets[] = "$column=?"; $values[] = max(0, min(9, (int)$body[$input])); }
  }
  if (isset($body['estadoManual'])) {
    $em = trim($body['estadoManual']);
    if (!in_array($em, ['Disponible', 'Reservada'], true)) jsonError('Estado inválido. Use Disponible o Reservada');
    $sets[] = 'estado_manual=?'; $values[] = $em;
  }
  if (!$sets) jsonError('No hay campos para actualizar');
  $values[] = (int)$m[1];
  try {
    $pdo->prepare('UPDATE mesas SET ' . implode(',', $sets) . ' WHERE id=?')->execute($values);
  } catch (PDOException $e) {
    // Instalaciones sin migracion_v3.sql aún no tienen estado_manual
    if (strpos($e->getMessage(), 'estado_manual') !== false) jsonError('Ejecute sql/migracion_v3.sql en el servidor primero', 500);
    throw $e;
  }
  auditLog($authUser, 'CONFIGURAR_MESA', null, $body['nombre'] ?? null, $body);
  jsonResponse(['success' => true, 'mensaje' => 'Mesa actualizada']);
}

jsonError('Ruta no encontrada', 404);
