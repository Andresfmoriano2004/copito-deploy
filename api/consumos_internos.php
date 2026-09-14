<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

// GET /api/consumos-internos
if ($method === 'GET' && $path === 'consumos-internos') {
  $persona = trim($_GET['persona'] ?? '');
  if ($persona) {
    $stmt = db()->prepare("SELECT ci.*, p.nombre AS prod_nombre, u.nombre AS usuario_nombre
      FROM consumos_internos ci
      JOIN productos p ON ci.codigo_producto = p.codigo
      LEFT JOIN usuarios u ON ci.usuario_id = u.id
      WHERE ci.persona = ?
      ORDER BY ci.fecha DESC LIMIT 200");
    $stmt->execute([$persona]);
  } else {
    $stmt = db()->query("SELECT ci.*, p.nombre AS prod_nombre, u.nombre AS usuario_nombre
      FROM consumos_internos ci
      JOIN productos p ON ci.codigo_producto = p.codigo
      LEFT JOIN usuarios u ON ci.usuario_id = u.id
      ORDER BY ci.fecha DESC LIMIT 200");
  }
  $rows = $stmt->fetchAll();
  jsonResponse(array_map(fn($r) => [
    'id' => (int)$r['id'], 'persona' => $r['persona'],
    'codigoProducto' => $r['codigo_producto'], 'productoNombre' => $r['prod_nombre'],
    'cantidad' => (float)$r['cantidad'], 'precioUnitario' => (float)$r['precio_unitario'],
    'subtotal' => (float)$r['subtotal'], 'notas' => $r['notas'] ?? null,
    'usuarioNombre' => $r['usuario_nombre'] ?? null,
    'fecha' => $r['fecha'], 'fechaHora' => fmtFechaHoraBogota($r['fecha']),
  ], $rows));
}

// GET /api/consumos-internos/resumen
if ($method === 'GET' && $path === 'consumos-internos/resumen') {
  $desde = $_GET['desde'] ?? date('Y-m-01');
  $hasta = $_GET['hasta'] ?? date('Y-m-d');
  $stmt = db()->prepare("SELECT persona, ROUND(SUM(subtotal),2) AS total, COUNT(*) AS items
    FROM consumos_internos WHERE DATE(fecha) BETWEEN ? AND ?
    GROUP BY persona ORDER BY total DESC");
  $stmt->execute([$desde, $hasta]);
  jsonResponse($stmt->fetchAll());
}

// POST /api/consumos-internos
if ($method === 'POST' && $path === 'consumos-internos') {
  $v = validate($body, [
    'persona' => 'required|string|max:100',
    'codigoProducto' => 'required|string|max:20',
    'cantidad' => 'required|numeric|min:0.01',
    'notas' => 'string|max:500',
  ]);

  $pdo = db();
  $pdo->beginTransaction();
  try {
    // Bloquear producto para evitar inconsistencias
    $prod = $pdo->prepare('SELECT precio, nombre FROM productos WHERE codigo=? FOR UPDATE');
    $prod->execute([$v['codigoProducto']]);
    $pRow = $prod->fetch();
    if (!$pRow) {
      $pdo->rollBack();
      jsonError('Producto no encontrado', 404);
    }

    // Verificar stock disponible
    $stk = $pdo->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),0) FROM movimientos WHERE codigo_producto=?");
    $stk->execute([$v['codigoProducto']]);
    $stockActual = (float)$stk->fetchColumn();
    if ($stockActual < $v['cantidad']) {
      $pdo->rollBack();
      jsonError("Stock insuficiente. Disponible: {$stockActual}");
    }

    $precio = round((float)$pRow['precio']);
    $subtotal = round($precio * $v['cantidad'], 2);

    $pdo->prepare('INSERT INTO consumos_internos (persona, codigo_producto, cantidad, precio_unitario, subtotal, notas, usuario_id) VALUES (?,?,?,?,?,?,?)')
      ->execute([$v['persona'], $v['codigoProducto'], $v['cantidad'], $precio, $subtotal, $v['notas'] ?? null, (int)$authUser['id']]);

    // Deduct stock
    $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
      ->execute([$v['codigoProducto'], 'SALIDA', $v['cantidad'], "Consumo interno: {$v['persona']} - {$pRow['nombre']}", (int)$authUser['id']]);

    $pdo->commit();
    auditLog($authUser, 'CONSUMO_INTERNO', null, null, ['persona' => $v['persona'], 'producto' => $pRow['nombre'], 'cantidad' => $v['cantidad'], 'subtotal' => $subtotal]);
    jsonResponse(['success' => true, 'mensaje' => 'Consumo registrado', 'subtotal' => $subtotal]);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Error en consumo interno: ' . $e->getMessage());
    jsonError('Error interno del servidor', 500);
  }
}

// DELETE /api/consumos-internos/{id}
if ($method === 'DELETE' && preg_match('#^consumos-internos/(.+)$#', $path, $m)) {
  $id = (int)$m[1];
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare('SELECT * FROM consumos_internos WHERE id=? FOR UPDATE');
    $stmt->execute([$id]);
    $consumo = $stmt->fetch();
    if (!$consumo) {
      $pdo->rollBack();
      jsonError('Consumo no encontrado', 404);
    }

    // Reverse stock
    $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
      ->execute([$consumo['codigo_producto'], 'INGRESO', $consumo['cantidad'], "Reversión consumo #{$id}: {$consumo['persona']}", (int)$authUser['id']]);

    $pdo->prepare('DELETE FROM consumos_internos WHERE id=?')->execute([$id]);
    $pdo->commit();
    jsonResponse(['success' => true, 'mensaje' => 'Consumo eliminado y stock reversado']);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Error al revertir consumo interno: ' . $e->getMessage());
    jsonError('Error interno del servidor', 500);
  }
}

jsonError('Ruta no encontrada', 404);
