-- ═══════════════════════════════════════════════════════════
-- Migración v8: Sistema de Propinas Independiente
-- Fecha: 2026-09-14
-- ═══════════════════════════════════════════════════════════

-- 1. Agregar tipo PROPINA al ENUM de caja_movimientos
ALTER TABLE caja_movimientos
  MODIFY COLUMN tipo ENUM('VENTA','INGRESO','EGRESO','PROPINA') NOT NULL;

-- 2. Tabla de propinas independiente
--    id_pedido = NULL → propina general (sin pedido asociado)
--    lugar     = NULL → propina general (sin mesa)
CREATE TABLE IF NOT EXISTS propinas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido   VARCHAR(20)                         DEFAULT NULL,
  lugar       VARCHAR(100)                        DEFAULT NULL,
  monto       DECIMAL(14,2)                       NOT NULL,
  metodo_pago ENUM('Efectivo','Transferencia')    NOT NULL DEFAULT 'Efectivo',
  usuario_id  INT                                 DEFAULT NULL,
  id_caja_mov INT                                 DEFAULT NULL,
  notas       TEXT                                DEFAULT NULL,
  fecha       TIMESTAMP                           DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (id_pedido)   REFERENCES pedidos(id_pedido)      ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)            ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (id_caja_mov) REFERENCES caja_movimientos(id)    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_prop_fecha   (fecha),
  INDEX idx_prop_pedido  (id_pedido),
  INDEX idx_prop_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
