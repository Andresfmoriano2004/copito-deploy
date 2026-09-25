<?php
// ─── Stock / inventory helpers ──────────────────────────────────────────────

/**
 * Returns the stock SQL subquery for a product.
 * Usage in SELECT: (getStockSubquery()) AS stock_actual
 * Usage in WHERE: (getStockSubquery()) >= ?
 */
function getStockSubquery() {
  return "(SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0) FROM movimientos WHERE codigo_producto = p.codigo)";
}

/**
 * Returns the materia prima stock SQL subquery.
 */
function getStockMpSubquery() {
  return "(SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0) FROM movimientos_materia_prima WHERE codigo_materia_prima = mp.codigo)";
}

/**
 * Check if stock is sufficient for a product.
 */
function checkStock($pdo, $codigo, $cantidad) {
  $stock = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0) AS stock_actual FROM movimientos WHERE codigo_producto=?");
  $stock->execute([$codigo]);
  return round((float)$stock->fetch()['stock_actual'], 2) >= round($cantidad, 2);
}

/**
 * Get current stock for a single product.
 */
function getStockProducto($pdo, $codigo) {
  $stock = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0) AS stock_actual FROM movimientos WHERE codigo_producto=?");
  $stock->execute([$codigo]);
  return round((float)$stock->fetch()['stock_actual'], 2);
}

/**
 * Get product price and name.
 */
function getProductoPrecio($pdo, $codigo) {
  $prod = $pdo->prepare('SELECT precio, nombre FROM productos WHERE codigo=?');
  $prod->execute([$codigo]);
  return $prod->fetch();
}

/**
 * Register stock exit for paid items and mark items as pagado.
 */
function registrarMovimientosStock($pdo, $items, $notaBase, $userId) {
  $insMov = $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)');
  $updPag = $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?');
  foreach ($items as $item) {
    // Skip items already paid (idempotency guard)
    if (!empty($item['pagado'])) continue;
    // Check stock sufficiency before deduction
    if (!checkStock($pdo, $item['codigo_producto'], $item['cantidad'])) {
      throw new Exception("Stock insuficiente para '{$item['nombre_producto']}' (disponible: " . getStockProducto($pdo, $item['codigo_producto']) . ", requerido: {$item['cantidad']})");
    }
    $insMov->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], $notaBase . " - " . $item['nombre_producto'], $userId]);
    $updPag->execute([$item['id']]);
  }
}

/**
 * Register a single stock exit (for item-level payments).
 */
function registrarStockSalida($pdo, $codigo, $cantidad, $notas, $userId) {
  $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
       ->execute([$codigo, 'SALIDA', $cantidad, $notas, $userId]);
}
