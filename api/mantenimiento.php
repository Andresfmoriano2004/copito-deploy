<?php
// ─── Mantenimiento: limpieza SELECTIVA de registros operativos ─────────────
// Solo admin. Nunca toca: usuarios, productos, grupos, unidades, mesas.
// El borrado respeta el orden de claves foráneas (hijos antes que padres)
// dentro de una transacción: si algo falla, todo se revierte.
//
// POST /api/mantenimiento/limpiar  { modulos: ['pedidos','movimientos','caja','auditoria'] }
//   pedidos     → pagos, detalle_pedido, pedidos
//   movimientos → movimientos (inventario)
//   caja        → caja_movimientos, caja
//   auditoria   → auditoria
// GET  /api/mantenimiento/conteo → conteo actual por módulo (para el modal)
require_once __DIR__ . '/config.php';
$authUser = requireAuth();
if (($authUser['rol'] ?? '') !== 'admin') jsonError('Solo un administrador puede limpiar registros', 403);

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$pdo = db();

// Orden FK-safe: hijos primero, padres después.
$MODULOS = [
  'pedidos'     => ['pagos', 'detalle_pedido', 'pedidos'],
  'movimientos' => ['movimientos'],
  'caja'        => ['caja_movimientos', 'caja'],
  'auditoria'   => ['auditoria'],
];

// GET /api/mantenimiento/conteo — cuántos registros hay por módulo
if ($method === 'GET' && $path === 'mantenimiento/conteo') {
  $conteo = [];
  foreach ($MODULOS as $modulo => $tablas) {
    $total = 0;
    foreach ($tablas as $t) {
      try {
        $total += (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
      } catch (Exception $e) {
        // Tabla inexistente: se ignora para no romper el conteo
      }
    }
    $conteo[$modulo] = $total;
  }
  jsonResponse(['conteo' => $conteo, 'protegidos' => ['usuarios', 'productos', 'grupos', 'unidades', 'mesas']]);
}

// POST /api/mantenimiento/limpiar — borrado selectivo con doble confirmación
// El frontend exige: (1) modal de advertencia + (2) escribir ELIMINAR.
if ($method === 'POST' && $path === 'mantenimiento/limpiar') {
  $body = jsonBody();
  $modulos = $body['modulos'] ?? [];
  $confirmacion = strtoupper(trim($body['confirmacion'] ?? ''));

  if (!is_array($modulos) || !count($modulos)) jsonError('Seleccione al menos un tipo de registro');
  foreach ($modulos as $m) {
    if (!isset($MODULOS[$m])) jsonError('Módulo no permitido: ' . $m);
  }
  if ($confirmacion !== 'ELIMINAR') jsonError('Debe escribir ELIMINAR para confirmar');

  // Tablas a borrar en orden FK-safe global (hijos → padres)
  $ordenGlobal = ['pagos', 'detalle_pedido', 'pedidos', 'movimientos', 'caja_movimientos', 'caja', 'auditoria'];
  $tablas = [];
  foreach ($ordenGlobal as $t) {
    foreach ($modulos as $m) {
      if (in_array($t, $MODULOS[$m], true) && !in_array($t, $tablas, true)) $tablas[] = $t;
    }
  }

  try {
    $pdo->beginTransaction();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $eliminados = [];
    foreach ($tablas as $t) {
      $n = $pdo->exec("DELETE FROM `$t`");
      $eliminados[$t] = $n === false ? 0 : (int)$n;
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    try { $pdo->exec('SET FOREIGN_KEY_CHECKS=1'); } catch (Exception $ignored) {}
    jsonError('No se pudo completar la limpieza: ' . $e->getMessage(), 500);
  }

  auditLog($authUser, 'LIMPIAR_REGISTROS', null, null, ['modulos' => $modulos, 'eliminados' => $eliminados]);
  jsonResponse(['success' => true, 'mensaje' => 'Registros eliminados correctamente', 'eliminados' => $eliminados]);
}

jsonError('Ruta no encontrada', 404);
