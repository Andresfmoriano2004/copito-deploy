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
  $prod = $pdo->prepare('SELECT precio, nombre, unidad, iva_porcentaje, tipo_item, codigo_barras
                         FROM productos WHERE codigo=?');
  $prod->execute([$codigo]);
  return $prod->fetch();
}

/**
 * Resuelve el precio unitario de un ítem según el rol (política del negocio).
 *
 * - admin : precio libre. Si envía 0 o no envía nada, usa el de catálogo.
 * - vendedor : no puede desviarse del catálogo. Se acepta el precio del catálogo
 *   o el que el ítem ya tiene (para no invalidar una edición de cantidad en un
 *   ítem cuyo precio ajustó un admin). Cualquier otro valor → 403.
 *
 * @param float      $precioCliente  precioUnitario recibido del cliente
 * @param float      $precioCatalogo productos.precio del ítem
 * @param array      $authUser       usuario autenticado (usa ['rol'])
 * @param float|null $precioActual   precio ya guardado del ítem (solo en PUT)
 * @return float precio definitivo
 */
function aplicarPrecioItem($precioCliente, $precioCatalogo, $authUser, $precioActual = null) {
  $precioCliente = round((float)$precioCliente, 2);
  $precioCatalogo = round((float)$precioCatalogo, 2);

  if (($authUser['rol'] ?? '') === 'admin') {
    return $precioCliente > 0 ? $precioCliente : $precioCatalogo;
  }
  if ($precioCliente <= 0) return $precioCatalogo;

  // Comparación en centavos enteros. En coma flotante
  // abs(8000.01 - 8000.00) === 0.010000000000005116, así que un `<= 0.01`
  // acepta o rechaza el mismo caso según los valores concretos.
  $centsCliente  = (int)round($precioCliente * 100);
  $centsCatalogo = (int)round($precioCatalogo * 100);
  $coincideCatalogo = $centsCliente === $centsCatalogo;
  $sinCambio = $precioActual !== null && $centsCliente === (int)round(round((float)$precioActual, 2) * 100);
  if (!$coincideCatalogo && !$sinCambio) {
    jsonError(
      'El precio ($' . number_format($precioCliente, 0, ',', '.') . ') no coincide con el catálogo ($' .
      number_format($precioCatalogo, 0, ',', '.') . '). Solo un administrador puede aplicar otro precio.',
      403
    );
  }
  return $precioCliente;
}

/**
 * Register stock exit for paid items and mark items as pagado.
 *
 * Stock HÍBRIDO (v11): si el producto tiene receta, lo que sale al cobrar es
 * materia prima y el producto terminado no se toca; si no tiene receta, manda
 * el producto terminado como siempre.
 */
function registrarMovimientosStock($pdo, $items, $notaBase, $userId) {
  $insMov = $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)');
  $updPag = $pdo->prepare('UPDATE detalle_pedido SET pagado=TRUE WHERE id=?');
  foreach ($items as $item) {
    // Skip items already paid (idempotency guard)
    if (!empty($item['pagado'])) continue;
    $nota = $notaBase . " - " . $item['nombre_producto'];

    if (tieneReceta($pdo, $item['codigo_producto'])) {
      $check = checkStockVenta($pdo, $item['codigo_producto'], $item['cantidad']);
      if ($check !== true) throw new Exception($check);
      consumirReceta($pdo, $item['codigo_producto'], $item['cantidad'], $nota, $userId);
    } else {
      // Check stock sufficiency before deduction
      if (!checkStock($pdo, $item['codigo_producto'], $item['cantidad'])) {
        throw new Exception("Stock insuficiente para '{$item['nombre_producto']}' (disponible: " . getStockProducto($pdo, $item['codigo_producto']) . ", requerido: {$item['cantidad']})");
      }
      $insMov->execute([$item['codigo_producto'], 'SALIDA', $item['cantidad'], $nota, $userId]);
    }
    $updPag->execute([$item['id']]);
  }
}

/**
 * Register a single stock exit (for item-level payments).
 * Misma regla híbrida que `registrarMovimientosStock` (v11).
 */
function registrarStockSalida($pdo, $codigo, $cantidad, $notas, $userId) {
  if (tieneReceta($pdo, $codigo)) {
    $check = checkStockVenta($pdo, $codigo, $cantidad);
    if ($check !== true) throw new Exception($check);
    consumirReceta($pdo, $codigo, $cantidad, $notas, $userId);
    return;
  }
  $pdo->prepare('INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?,?,?,?,?)')
       ->execute([$codigo, 'SALIDA', $cantidad, $notas, $userId]);
}

// ─── Recetas: stock híbrido y costo teórico (v11) ───────────────────────────

/**
 * ¿Este producto se fabrica a partir de receta?
 *
 * Es la rama que decide qué stock mira y descuenta la venta:
 *   - con receta  → consume materia prima (fabricación bajo demanda);
 *   - sin receta  → mide y descuenta producto terminado (comportamiento previo).
 *
 * OJO: `checkStock()` NO cambió. Sigue midiendo producto terminado porque es
 * la regla correcta para los movimientos manuales (`/movimientos`) y para los
 * consumos internos, que sí sacan producto ya terminado.
 */
function tieneReceta($pdo, $codigo) {
  $st = $pdo->prepare('SELECT 1 FROM recetas WHERE codigo_producto=? LIMIT 1');
  $st->execute([$codigo]);
  return (bool)$st->fetchColumn();
}

/**
 * Insumos de la receta de un producto, cada uno con su stock actual.
 *   requerido = lo que consume UNA unidad  (recetas.cantidad)
 *   stock     = lo que hay hoy en materia prima
 */
function insumosReceta($pdo, $codigo) {
  $st = $pdo->prepare(
    "SELECT r.codigo_materia_prima AS codigo, mp.nombre, mp.unidad,
            r.cantidad AS requerido, mp.costo,
            (SELECT COALESCE(ROUND(SUM(CASE WHEN m.tipo='INGRESO' THEN m.cantidad ELSE -m.cantidad END),2),0)
               FROM movimientos_materia_prima m
              WHERE m.codigo_materia_prima = r.codigo_materia_prima) AS stock
       FROM recetas r
       JOIN materia_prima mp ON mp.codigo = r.codigo_materia_prima
      WHERE r.codigo_producto = ?
      ORDER BY r.codigo_materia_prima"
  );
  $st->execute([$codigo]);
  return $st->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Compara en centavos enteros.
 *
 * `movimientos_materia_prima.cantidad` es DECIMAL(12,2), igual que todo lo demás
 * de stock y dinero del proyecto. Comparar en coma flotante con un `>` suelto
 * hace que la misma cantidad se acepte o se rechace según los valores concretos
 * (abs(0.07 - 0.07) === 0.0). Esto es el mismo criterio de
 * `aplicarPrecioItem()`.
 */
function centavos($valor) {
  return (int)round((float)$valor * 100);
}

/**
 * Cantidad de insumo que consume `unidades` del producto.
 * Redondeada a 2 decimales: es la precisión de la columna que la almacena, y
 * `checkStockVenta()` y `consumirReceta()` tienen que redondear IGUAL o la
 * venta queda bloqueada por un stock que alcanza en teoría.
 */
function cantidadInsumo($porUnidad, $unidades) {
  return round((float)$porUnidad * (float)$unidades, 2);
}

/**
 * ¿Se puede vender `cantidad` unidades de $codigo?
 *
 * Devuelve `true`, o el mensaje de error ya redactado para responderle al POS.
 * En el camino de error nada más se consulta el nombre del producto, así que
 * el caso feliz cuesta una sola consulta extra (`tieneReceta`).
 */
function checkStockVenta($pdo, $codigo, $cantidad) {
  if (!tieneReceta($pdo, $codigo)) {
    return checkStock($pdo, $codigo, $cantidad) ? true : 'Stock insuficiente';
  }
  foreach (insumosReceta($pdo, $codigo) as $i) {
    $requerido = cantidadInsumo($i['requerido'], $cantidad);
    if (centavos($requerido) > centavos($i['stock'])) {
      $p = getProductoPrecio($pdo, $codigo);
      $prod = ($p && isset($p['nombre'])) ? $p['nombre'] : $codigo;
      return "Sin materia prima para '{$prod}': hace falta {$requerido} {$i['unidad']} de {$i['nombre']} y hay " . round((float)$i['stock'], 2) . ".";
    }
  }
  return true;
}

/**
 * Descuenta materia prima por `unidades` de un producto con receta.
 * Devuelve la cantidad de movimientos escritos.
 */
function consumirReceta($pdo, $codigoProducto, $unidades, $notas, $userId) {
  $ins = $pdo->prepare("INSERT INTO movimientos_materia_prima
      (codigo_materia_prima, tipo, cantidad, notas, usuario_id) VALUES (?, 'SALIDA', ?, ?, ?)");
  $n = 0;
  foreach (insumosReceta($pdo, $codigoProducto) as $i) {
    $q = cantidadInsumo($i['requerido'], $unidades);
    if (centavos($q) <= 0) continue; // un insumo de 0 no mueve stock
    $ins->execute([$i['codigo'], $q, $notas, $userId]);
    $n++;
  }
  return $n;
}

/**
 * Devuelve la materia prima consumida (reversión al cancelar el pedido).
 * Debe escribir exactamente lo contrario de `consumirReceta()`: mismo insumo,
 * misma cantidad, redondeo idéntico. Devuelve la cantidad de movimientos.
 */
function devolverReceta($pdo, $codigoProducto, $unidades, $notas, $userId) {
  $ins = $pdo->prepare("INSERT INTO movimientos_materia_prima
      (codigo_materia_prima, tipo, cantidad, notas, usuario_id) VALUES (?, 'INGRESO', ?, ?, ?)");
  $n = 0;
  foreach (insumosReceta($pdo, $codigoProducto) as $i) {
    $q = cantidadInsumo($i['requerido'], $unidades);
    if (centavos($q) <= 0) continue;
    $ins->execute([$i['codigo'], $q, $notas, $userId]);
    $n++;
  }
  return $n;
}

/**
 * Costo teórico de UNA unidad de producto: lo que cuesta su receta.
 * `null` si el producto no tiene receta — ahí el costo válido es el que cargó
 * el administrador en `productos.costo`, y mezclarlos daría un número inventado.
 */
function costoTeorico($pdo, $codigo) {
  $st = $pdo->prepare(
    "SELECT COUNT(*) AS lineas, COALESCE(SUM(r.cantidad * mp.costo), 0) AS costo
       FROM recetas r JOIN materia_prima mp ON mp.codigo = r.codigo_materia_prima
      WHERE r.codigo_producto = ?");
  $st->execute([$codigo]);
  $r = $st->fetch(PDO::FETCH_ASSOC);
  return ((int)$r['lineas'] > 0) ? round((float)$r['costo'], 2) : null;
}
