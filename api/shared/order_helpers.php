<?php
// ─── Order query helpers ───────────────────────────────────────────────────

function generarId() {
  return 'PED-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -5));
}

function fetchPedido($pdo, $id) {
  $stmt = $pdo->prepare ('SELECT * FROM pedidos WHERE id_pedido=?');
  $stmt->execute([$id]);
  return $stmt->fetch();
}

function fetchPedidoItems($pdo, $id) {
  $det = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? ORDER BY cuenta, id');
  $det->execute([$id]);
  return array_map(fn($d) => [
    'id' => (int)$d['id'], 'codigo' => $d['codigo_producto'], 'nombre' => $d['nombre_producto'],
    'cantidad' => (float)$d['cantidad'], 'precioUnitario' => (float)$d['precio_unitario'],
    'subtotal' => (float)$d['subtotal'], 'notas' => $d['notas'] ?? '', 'cuenta' => $d['cuenta'] ?? null,
    'pagado' => (bool)$d['pagado'],
    // Campos fiscales de la línea (v9). El comprobante los lee de aquí:
    // detalle_pedido queda inmutable en cuanto el pedido sale de 'Abierto'.
    'unidad' => $d['unidad'] ?? 'Und',
    'tipoItem' => $d['tipo_item'] ?? 'Bien',
    'ivaPorcentaje' => (float)($d['iva_porcentaje'] ?? 0),
    'baseGravable' => (float)($d['base_gravable'] ?? 0),
    'ivaValor' => (float)($d['iva_valor'] ?? 0),
  ], $det->fetchAll());
}

function fetchPedidoPagos($pdo, $id) {
  $pagStmt = $pdo->prepare('SELECT p.*, d.nombre_producto AS item_nombre FROM pagos p LEFT JOIN detalle_pedido d ON d.id=p.detalle_id WHERE p.id_pedido=? ORDER BY p.id');
  $pagStmt->execute([$id]);
  return array_map(fn($p) => [
    'id' => (int)$p['id'], 'cuenta' => $p['cuenta'] ?? null, 'metodoPago' => $p['metodo_pago'],
    'monto' => (float)$p['monto'], 'fecha' => $p['fecha'],
    'fechaHora' => fmtFechaHoraBogota($p['fecha'] ?? null),
    'hora' => fmtHoraBogota($p['fecha'] ?? null),
    'itemNombre' => $p['item_nombre'] ?? null,
    'detalleId' => $p['detalle_id'] !== null ? (int)$p['detalle_id'] : null
  ], $pagStmt->fetchAll());
}

/**
 * Recalcula el total del pedido y sus agregados fiscales.
 *
 * Los totales de IVA se SUMAN desde detalle_pedido (que ya guardó cada línea
 * desgranada al agregarla) en lugar de recomputarlos: así el encabezado nunca
 * puede divergir de la suma de sus propias líneas.
 */
function updatePedidoTotal($pdo, $id) {
  $sum = $pdo->prepare('SELECT COALESCE(ROUND(SUM(subtotal),2),0)       AS total,
                               COALESCE(ROUND(SUM(base_gravable),2),0)   AS base,
                               COALESCE(ROUND(SUM(iva_valor),2),0)       AS iva
                        FROM detalle_pedido WHERE id_pedido=?');
  $sum->execute([$id]);
  $t = $sum->fetch() ?: ['total' => 0, 'base' => 0, 'iva' => 0];
  $pdo->prepare('UPDATE pedidos SET total=?, total_base=?, total_iva=? WHERE id_pedido=?')
      ->execute([
        round((float)$t['total'], 2),
        round((float)$t['base'], 2),
        round((float)$t['iva'], 2),
        $id,
      ]);
}

function validarCuentaPedido($pdo, $idPedido, $cuenta) {
  if ($cuenta === null) return true;
  $cuenta = strtoupper(trim($cuenta));
  if (strlen($cuenta) !== 1 || $cuenta < 'A' || $cuenta > 'Z') return false;
  $stmt = $pdo->prepare('SELECT cuentas_activas FROM pedidos WHERE id_pedido=?');
  $stmt->execute([$idPedido]);
  $row = $stmt->fetch();
  if ($row && $row['cuentas_activas']) {
    $activas = explode(',', $row['cuentas_activas']);
    if (in_array($cuenta, $activas)) return true;
  }
  $det = $pdo->prepare('SELECT DISTINCT cuenta FROM detalle_pedido WHERE id_pedido=? AND cuenta IS NOT NULL');
  $det->execute([$idPedido]);
  $existentes = array_column($det->fetchAll(), 'cuenta');
  return in_array($cuenta, $existentes);
}

/**
 * Autorización de acceso a pedidos por rol.
 * - Administradores: acceso total.
 * - Vendedores: solo pedidos creados por ellos (usuario_id).
 */
function autorizarAccesoPedido($pedido, $authUser) {
  if (!$pedido) jsonError('Pedido no encontrado', 404);
  $rol = $authUser['rol'] ?? '';
  if ($rol === 'admin') return true;
  if ($rol === 'vendedor') {
    $ownerId = (int)($pedido['usuario_id'] ?? 0);
    $currentId = (int)($authUser['id'] ?? 0);
    if ($ownerId !== $currentId) {
      jsonError('No tienes permiso para acceder a este pedido', 403);
    }
  }
  return true;
}
