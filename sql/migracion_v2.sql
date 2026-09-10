-- Ejecutar una sola vez sobre la base existente de Hostinger.
ALTER TABLE productos ADD COLUMN imagen_url VARCHAR(255) DEFAULT NULL;
ALTER TABLE usuarios ADD COLUMN codigo_referencia VARCHAR(20) UNIQUE;
ALTER TABLE pedidos ADD COLUMN cancelado_por INT DEFAULT NULL, ADD COLUMN cancelado_en TIMESTAMP NULL, ADD COLUMN cancelacion_motivo VARCHAR(255) DEFAULT NULL;
ALTER TABLE pagos ADD COLUMN usuario_id INT DEFAULT NULL, ADD COLUMN mesa VARCHAR(50) DEFAULT NULL;
ALTER TABLE movimientos ADD COLUMN usuario_id INT DEFAULT NULL;
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  codigo_referencia VARCHAR(20) DEFAULT NULL,
  operacion VARCHAR(60) NOT NULL,
  pedido_id VARCHAR(20) DEFAULT NULL,
  mesa VARCHAR(50) DEFAULT NULL,
  detalle JSON DEFAULT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auditoria_fecha (fecha), INDEX idx_auditoria_pedido (pedido_id), INDEX idx_auditoria_usuario (usuario_id)
) ENGINE=InnoDB;
UPDATE usuarios SET codigo_referencia = CONCAT(CASE rol WHEN 'admin' THEN 'ADM-' ELSE 'MES-' END, LPAD(id, 3, '0')) WHERE codigo_referencia IS NULL;
CREATE TABLE IF NOT EXISTS mesas (
  id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE,
  capacidad INT NOT NULL DEFAULT 4, pos_x TINYINT NOT NULL DEFAULT 0,
  pos_y TINYINT NOT NULL DEFAULT 0, orden INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT IGNORE INTO mesas (nombre, capacidad, pos_x, pos_y, orden) VALUES
('Mesa 1', 4, 0, 0, 1), ('Mesa 2', 4, 1, 0, 2), ('Mesa 3', 4, 0, 1, 3);