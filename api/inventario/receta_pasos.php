<?php
// ─── Recetas de preparación: procedimiento paso a paso ──────────────────────
//
// `receta_pasos` guarda CÓMO se prepara un producto (sql/migracion_v10).
// No confundir con `recetas` (v7a), que guarda CUÁNTO entra de materia prima.
//
//   GET    /api/receta-pasos                 → todos los pasos (agrupados por producto)
//   GET    /api/receta-pasos?producto=COD    → pasos de un producto
//   GET    /api/receta-pasos/{codigo}        → pasos de un producto (amigable en URL)
//   PUT    /api/receta-pasos/{codigo}        → reemplaza la receta entera  (admin)
//   DELETE /api/receta-pasos/{codigo}        → borra la preparación        (admin)
//
// Un producto = una receta: el PUT es de REEMPLAZO, no de parche. Así el
// orden que arma el editor es el que sale en la comanda, sin renumerar a mano.
require_once __DIR__ . '/../config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();

/** Fila de `receta_pasos` → contrato JSON. */
function filaPaso($r) {
  return [
    'id' => (int)$r['id'],
    'codigoProducto' => $r['codigo_producto'],
    'productoNombre' => $r['prod_nombre'] ?? null,
    'orden' => (int)$r['orden'],
    'titulo' => $r['titulo'],
    'instruccion' => $r['instruccion'],
    'tiempoMin' => $r['tiempo_min'] === null ? null : (float)$r['tiempo_min'],
    'equipo' => $r['equipo'],
  ];
}

/**
 * Pasos de un producto (o de todos si $codigo es null), siempre ordenados
 * por nombre de producto y luego por `orden`.
 */
function leerPasos($codigo = null) {
  $sql = "SELECT p.*, pr.nombre AS prod_nombre
            FROM receta_pasos p
            JOIN productos pr ON pr.codigo = p.codigo_producto";
  if ($codigo !== null && $codigo !== '') $sql .= " WHERE p.codigo_producto = ?";
  $sql .= " ORDER BY pr.nombre, p.orden";
  $st = db()->prepare($sql);
  $st->execute($codigo !== null && $codigo !== '' ? [$codigo] : []);
  return array_map('filaPaso', $st->fetchAll());
}

/**
 * Valida una lista de pasos. Devuelve las filas listas para insertar.
 *
 * OJO: todo esto corre ANTES de abrir la transacción, porque `jsonError()`
 * hace `exit` y dejaría la transacción colgada hasta que cierre la conexión.
 */
function validarPasos($pasos) {
  if (!is_array($pasos)) jsonError('pasos debe ser una lista', 422);
  $pasos = array_values($pasos);
  if (count($pasos) > 50) jsonError('Máximo 50 pasos por receta', 422);

  $limpios = [];
  foreach ($pasos as $i => $p) {
    $n = $i + 1;
    if (!is_array($p)) jsonError("El paso $n no es válido", 422);

    $instr = trim((string)($p['instruccion'] ?? ''));
    if ($instr === '') jsonError("El paso $n necesita la instrucción", 422);
    if (mb_strlen($instr) > 2000) jsonError("El paso $n excede 2000 caracteres", 422);

    $titulo = trim((string)($p['titulo'] ?? ''));
    if ($titulo !== '' && mb_strlen($titulo) > 120) jsonError("El paso $n: el título excede 120 caracteres", 422);

    $tiempo = $p['tiempoMin'] ?? null;
    if ($tiempo === '' || $tiempo === null) {
      $tiempo = null;
    } elseif (!is_numeric($tiempo) || (float)$tiempo < 0 || (float)$tiempo > 1440) {
      jsonError("El paso $n: el tiempo debe estar entre 0 y 1440 minutos", 422);
    } else {
      $tiempo = round((float)$tiempo, 2);
    }

    $equipo = trim((string)($p['equipo'] ?? ''));
    if ($equipo !== '' && mb_strlen($equipo) > 60) jsonError("El paso $n: el equipo excede 60 caracteres", 422);

    $limpios[] = [
      'titulo' => $titulo === '' ? null : $titulo,
      'instruccion' => $instr,
      'tiempo_min' => $tiempo,
      'equipo' => $equipo === '' ? null : $equipo,
    ];
  }
  return $limpios;
}

/**
 * Reemplaza la receta completa de un producto de forma atómica.
 * Si algo falla a mitad, no queda la receta a medio borrar.
 */
function reemplazarPasos($codigo, $pasos) {
  $st = db()->prepare('SELECT nombre FROM productos WHERE codigo=?');
  $st->execute([$codigo]);
  if (!$st->fetch()) jsonError('Producto no encontrado', 404);

  $limpios = validarPasos($pasos);   // ← valida primero: jsonError hace exit

  $pdo = db();
  $pdo->beginTransaction();
  try {
    $pdo->prepare('DELETE FROM receta_pasos WHERE codigo_producto=?')->execute([$codigo]);
    if ($limpios) {
      $ins = $pdo->prepare('INSERT INTO receta_pasos
        (codigo_producto, orden, titulo, instruccion, tiempo_min, equipo)
        VALUES (?,?,?,?,?,?)');
      foreach ($limpios as $i => $p) {
        $ins->execute([$codigo, $i + 1, $p['titulo'], $p['instruccion'], $p['tiempo_min'], $p['equipo']]);
      }
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    serverError($e);
  }
  return count($limpios);
}

// ─── GET ─────────────────────────────────────────────────────────────────────

// GET /api/receta-pasos[?producto=COD]
if ($method === 'GET' && $path === 'receta-pasos') {
  $producto = trim($_GET['producto'] ?? '');
  jsonResponse(leerPasos($producto !== '' ? $producto : null));
}

// GET /api/receta-pasos/{codigo}
if ($method === 'GET' && preg_match('#^receta-pasos/(.+)$#', $path, $m)) {
  jsonResponse(leerPasos(trim($m[1])));
}

// ─── PUT (reemplazo atómico, solo admin) ────────────────────────────────────

// PUT /api/receta-pasos/{codigo}  { pasos: [ {titulo, instruccion, tiempoMin, equipo} ] }
if ($method === 'PUT' && preg_match('#^receta-pasos/(.+)$#', $path, $m)) {
  requireRole('admin');
  $codigo = trim($m[1]);
  if ($codigo === '') jsonError('Producto no indicado', 422);

  $total = reemplazarPasos($codigo, $body['pasos'] ?? null);
  auditLog($authUser, 'GUARDAR_RECETA_PASOS', null, null, ['producto' => $codigo, 'pasos' => $total]);
  jsonResponse(['success' => true,
                'mensaje' => $total ? "Receta guardada ($total paso" . ($total === 1 ? '' : 's') . ")"
                                    : 'Preparación vaciada',
                'pasos' => $total]);
}

// ─── DELETE (solo admin) ─────────────────────────────────────────────────────

// DELETE /api/receta-pasos/{codigo}
if ($method === 'DELETE' && preg_match('#^receta-pasos/(.+)$#', $path, $m)) {
  requireRole('admin');
  $codigo = trim($m[1]);
  $st = db()->prepare('DELETE FROM receta_pasos WHERE codigo_producto=?');
  $st->execute([$codigo]);
  if ($st->rowCount() === 0) jsonError('Este producto no tiene preparación escrita', 404);
  auditLog($authUser, 'BORRAR_RECETA_PASOS', null, null, ['producto' => $codigo]);
  jsonResponse(['success' => true, 'mensaje' => 'Preparación eliminada']);
}

jsonError('Ruta no encontrada', 404);
