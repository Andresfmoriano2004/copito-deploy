<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';

// GET /api/movimientos - historial
// Fase 2: ?page= activa {data,total,page,limit}; legacy con ?offset&limit o array.
if ($method === 'GET' && $path === 'movimientos') {
  $pg = pageParams(100, 1000);
  if ($pg['hasPaging']) {
    $total = (int)db()->query('SELECT COUNT(*) FROM movimientos')->fetchColumn();
    $stmt = db()->prepare("
      SELECT m.*, p.nombre AS producto, p.unidad
      FROM movimientos m LEFT JOIN productos p ON p.codigo = m.codigo_producto
      ORDER BY m.fecha DESC, m.id DESC LIMIT {$pg['limit']} OFFSET {$pg['offset']}
    ");
    $stmt->execute();
    $rows = $stmt->fetchAll();
  } else {
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $limit = min(1000, max(1, (int)($_GET['limit'] ?? 500)));
    $rows = db()->prepare("
      SELECT m.*, p.nombre AS producto, p.unidad
      FROM movimientos m LEFT JOIN productos p ON p.codigo = m.codigo_producto
      ORDER BY m.fecha DESC, m.id DESC LIMIT $limit OFFSET $offset
    ");
    $rows->execute();
    $rows = $rows->fetchAll();
  }
  $mapMov = function($r) {
    $f = fechaBogota($r['fecha']);
    return [
      'id' => (int)$r['id'], 'codigo' => $r['codigo_producto'],
      'producto' => $r['producto'] ?? $r['codigo_producto'],
      'unidad' => $r['unidad'] ?? '', 'tipo' => $r['tipo'],
      'cantidad' => (float)$r['cantidad'], 'nota' => $r['notas'] ?? '',
      'fecha' => $f['fecha'],
      'hora' => $f['hora'],
      'fechaHora' => $f['fechaHora'],
      'fechaISO' => $f['iso']
    ];
  };
  if ($pg['hasPaging']) pagedResponse(array_map($mapMov, $rows), $total, $pg['page'], $pg['limit']);
  jsonResponse(array_map($mapMov, $rows));
}

// GET /api/movimientos/stock
if ($method === 'GET' && $path === 'movimientos/stock') {
  $rows = db()->query("
    SELECT p.codigo, p.nombre, p.unidad, p.grupo, p.stock_minimo, p.precio, p.costo, p.imagen_url,
      COALESCE((SELECT SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END)
                FROM movimientos WHERE codigo_producto = p.codigo), 0) AS stock_actual
    FROM productos p ORDER BY p.nombre
  ")->fetchAll();
  jsonResponse(array_map(function($r) {
    return [
      'codigo' => $r['codigo'], 'nombre' => $r['nombre'], 'unidad' => $r['unidad'],
      'grupo' => $r['grupo'], 'stockMinimo' => (float)$r['stock_minimo'],
      'precio' => (float)$r['precio'], 'costo' => (float)$r['costo'],
      'imagenUrl' => $r['imagen_url'] ?? null,
      'stockActual' => (float)$r['stock_actual']
    ];
  }, $rows));
}

// POST /api/movimientos - registrar (Fase 3: validación central, mismo contrato)
if ($method === 'POST' && $path === 'movimientos') {
  $body = jsonBody();
  $codigo = trim($body['codigo'] ?? '');
  $tipo = $body['tipo'] ?? '';
  $cantidad = (float)($body['cantidad'] ?? 0);
  $nota = trim($body['nota'] ?? $body['notas'] ?? '');

  if (!$codigo || !$tipo || $cantidad <= 0) jsonError('Código, tipo y cantidad requeridos');
  // Fase 3: endurece tipos/formatos con los mismos mensajes de error base
  validate($body, ['codigo' => 'string|max:20', 'tipo' => 'in:INGRESO,SALIDA', 'cantidad' => 'numeric|min:0.01']);

  $pdo = db();
  $pdo->beginTransaction();
  try {
    $producto = $pdo->prepare('SELECT codigo FROM productos WHERE codigo=? FOR UPDATE');
    $producto->execute([$codigo]);
    if (!$producto->fetch()) {
      $pdo->rollBack();
      jsonError('Producto no encontrado', 404);
    }
    if ($tipo === 'SALIDA') {
      $stock = $pdo->prepare("SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),0) FROM movimientos WHERE codigo_producto=?");
      $stock->execute([$codigo]);
      if ((float)$stock->fetchColumn() < $cantidad) {
        $pdo->rollBack();
        jsonError('Stock insuficiente');
      }
    }

    $stmt = $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)');
    $stmt->execute([$codigo, $tipo, $cantidad, $nota, $authUser['id']]);
    $pdo->commit();
    auditLog($authUser, 'REGISTRAR_MOVIMIENTO', null, null, ['codigo' => $codigo, 'tipo' => $tipo, 'cantidad' => $cantidad]);
    jsonResponse(['success' => true, 'mensaje' => 'Movimiento registrado']);
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Error en registro de movimiento: ' . $e->getMessage());
    jsonError('Error interno del servidor', 500);
  }
}

jsonError('Ruta no encontrada', 404);
