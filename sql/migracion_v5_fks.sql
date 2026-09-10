-- =====================================================
-- Migración v5: integridad referencial (FKs) — Fase 4
-- Ejecutar UNA sola vez (phpMyAdmin > SQL), DESPUÉS de v2/v3/v4,
-- con la app detenida (sin ventas en curso).
-- Política: ON DELETE RESTRICT (nunca borrado en cascada: protege
-- historial de ventas/caja) + ON UPDATE CASCADE.
-- Si algún ALTER falla por huérfanos, el SELECT del PASO 0 dice cuáles.
-- =====================================================

-- ─── PASO 0: verificación de huérfanos (solo lectura; todo debe dar 0) ───
SELECT 'mov_sin_prod' AS check_huerfano, COUNT(*) AS n FROM movimientos m LEFT JOIN productos p ON p.codigo = m.codigo_producto WHERE p.codigo IS NULL;
SELECT 'det_sin_ped' AS check_huerfano, COUNT(*) AS n FROM detalle_pedido d LEFT JOIN pedidos p ON p.id_pedido = d.id_pedido WHERE p.id_pedido IS NULL;
SELECT 'det_sin_prod' AS check_huerfano, COUNT(*) AS n FROM detalle_pedido d LEFT JOIN productos p ON p.codigo = d.codigo_producto WHERE p.codigo IS NULL;
SELECT 'pag_sin_ped' AS check_huerfano, COUNT(*) AS n FROM pagos pg LEFT JOIN pedidos p ON p.id_pedido = pg.id_pedido WHERE p.id_pedido IS NULL;
SELECT 'pag_det_huerf' AS check_huerfano, COUNT(*) AS n FROM pagos pg LEFT JOIN detalle_pedido d ON d.id = pg.detalle_id WHERE pg.detalle_id IS NOT NULL AND d.id IS NULL;
SELECT 'cjm_sin_caja' AS check_huerfano, COUNT(*) AS n FROM caja_movimientos c LEFT JOIN caja ca ON ca.id = c.id_caja WHERE ca.id IS NULL;
SELECT 'cjm_sin_ped' AS check_huerfano, COUNT(*) AS n FROM caja_movimientos c LEFT JOIN pedidos p ON p.id_pedido = c.id_pedido WHERE c.id_pedido IS NOT NULL AND p.id_pedido IS NULL;
SELECT 'ped_usr_huerf' AS check_huerfano, COUNT(*) AS n FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE p.usuario_id IS NOT NULL AND u.id IS NULL;
SELECT 'ped_cancel_huerf' AS check_huerfano, COUNT(*) AS n FROM pedidos p LEFT JOIN usuarios u ON u.id = p.cancelado_por WHERE p.cancelado_por IS NOT NULL AND u.id IS NULL;
SELECT 'mov_usr_huerf' AS check_huerfano, COUNT(*) AS n FROM movimientos m LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE m.usuario_id IS NOT NULL AND u.id IS NULL;
SELECT 'pag_usr_huerf' AS check_huerfano, COUNT(*) AS n FROM pagos pg LEFT JOIN usuarios u ON u.id = pg.usuario_id WHERE pg.usuario_id IS NOT NULL AND u.id IS NULL;
SELECT 'cjm_usr_huerf' AS check_huerfano, COUNT(*) AS n FROM caja_movimientos c LEFT JOIN usuarios u ON u.id = c.usuario_id WHERE c.usuario_id IS NOT NULL AND u.id IS NULL;
SELECT 'aud_usr_huerf' AS check_huerfano, COUNT(*) AS n FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE u.id IS NULL;
SELECT 'aud_ped_huerf' AS check_huerfano, COUNT(*) AS n FROM auditoria a LEFT JOIN pedidos p ON p.id_pedido = a.pedido_id WHERE a.pedido_id IS NOT NULL AND p.id_pedido IS NULL;

-- ─── PASO 1: FKs (InnoDB crea automáticamente los índices que falten) ───
ALTER TABLE movimientos
  ADD CONSTRAINT fk_mov_producto FOREIGN KEY (codigo_producto) REFERENCES productos(codigo) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE detalle_pedido
  ADD CONSTRAINT fk_det_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_det_producto FOREIGN KEY (codigo_producto) REFERENCES productos(codigo) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE pagos
  ADD CONSTRAINT fk_pag_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_pag_detalle FOREIGN KEY (detalle_id) REFERENCES detalle_pedido(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_pag_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE pedidos
  ADD CONSTRAINT fk_ped_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_ped_cancelado FOREIGN KEY (cancelado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE caja_movimientos
  ADD CONSTRAINT fk_cjm_caja FOREIGN KEY (id_caja) REFERENCES caja(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_cjm_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_cjm_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE auditoria
  ADD CONSTRAINT fk_aud_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_aud_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido) ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOTA: productos.unidad/grupo y pagos.mesa NO llevan FK a propósito:
-- son texto libre (unidades/grupos son catálogos renombrables y los lugares
-- incluyen Barra/Sofá que no existen en la tabla mesas).
-- NOTA: con RESTRICT, borrar un producto con movimientos devuelve 409
-- (el backend lo traduce; el frontend ya avisa de esta posibilidad).
