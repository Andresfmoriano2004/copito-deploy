-- =====================================================
-- DPCoffee - Base de datos consolidada (PHP version)
-- phpMyAdmin > Seleccionar BD en barra izquierda > SQL > Pegar > Go
-- =====================================================

CREATE TABLE IF NOT EXISTS grupos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS unidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS productos (
  codigo VARCHAR(20) PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  unidad VARCHAR(50) NOT NULL,
  grupo VARCHAR(100) NOT NULL,
  stock_minimo DECIMAL(12,2) DEFAULT 0,
  precio DECIMAL(14,2) DEFAULT 0,
  costo DECIMAL(14,2) DEFAULT 0,
  imagen_url VARCHAR(255) DEFAULT NULL,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_producto VARCHAR(20) NOT NULL,
  tipo ENUM('INGRESO','SALIDA') NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  notas TEXT,
  usuario_id INT DEFAULT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  rol ENUM('admin','vendedor') DEFAULT 'vendedor',
  activo BOOLEAN DEFAULT TRUE,
  codigo_referencia VARCHAR(20) UNIQUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pedidos (
  id_pedido VARCHAR(20) PRIMARY KEY,
  lugar VARCHAR(50) NOT NULL,
  cliente VARCHAR(200) DEFAULT '',
  notas TEXT,
  estado ENUM('Abierto','Cerrado','Cancelado') DEFAULT 'Abierto',
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TIMESTAMP NULL,
  total DECIMAL(14,2) DEFAULT 0,
  metodo_pago VARCHAR(50) DEFAULT '',
  usuario_id INT DEFAULT NULL,
  vendedor VARCHAR(100) DEFAULT NULL,
  cancelado_por INT DEFAULT NULL,
  cancelado_en TIMESTAMP NULL,
  cancelacion_motivo VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido VARCHAR(20) NOT NULL,
  codigo_producto VARCHAR(20) NOT NULL,
  nombre_producto VARCHAR(200) NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  notas TEXT,
  pagado BOOLEAN NOT NULL DEFAULT FALSE,
  cuenta VARCHAR(1) DEFAULT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido VARCHAR(20) NOT NULL,
  cuenta VARCHAR(10) DEFAULT NULL,
  detalle_id INT DEFAULT NULL,
  metodo_pago VARCHAR(50) NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  notas TEXT,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT DEFAULT NULL,
  mesa VARCHAR(50) DEFAULT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS caja (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TIMESTAMP NULL,
  monto_inicial DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_esperado DECIMAL(14,2) DEFAULT 0,
  monto_fisico DECIMAL(14,2) DEFAULT 0,
  diferencia DECIMAL(14,2) DEFAULT 0,
  estado ENUM('Abierta','Cerrada') DEFAULT 'Abierta',
  notas TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_caja INT NOT NULL,
  tipo ENUM('VENTA','INGRESO','EGRESO') NOT NULL,
  metodo_pago VARCHAR(50) DEFAULT '',
  tipo_pago ENUM('FISICO','BANCARIO') DEFAULT NULL,
  descripcion VARCHAR(255),
  monto DECIMAL(14,2) NOT NULL,
  id_pedido VARCHAR(20) DEFAULT NULL,
  usuario_id INT DEFAULT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_movimientos_producto ON movimientos(codigo_producto);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_lugar ON pedidos(lugar);
CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX idx_detalle_pedido ON detalle_pedido(id_pedido);
CREATE INDEX idx_caja_estado ON caja(estado);
CREATE INDEX idx_caja_movimientos_caja ON caja_movimientos(id_caja);
CREATE INDEX idx_caja_movimientos_usuario ON caja_movimientos(usuario_id);

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  codigo_referencia VARCHAR(20) DEFAULT NULL,
  operacion VARCHAR(60) NOT NULL,
  pedido_id VARCHAR(20) DEFAULT NULL,
  mesa VARCHAR(50) DEFAULT NULL,
  detalle JSON DEFAULT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auditoria_fecha (fecha),
  INDEX idx_auditoria_pedido (pedido_id),
  INDEX idx_auditoria_usuario (usuario_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mesas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  capacidad INT NOT NULL DEFAULT 4,
  pos_x TINYINT NOT NULL DEFAULT 0,
  pos_y TINYINT NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  estado_manual VARCHAR(20) NOT NULL DEFAULT 'Disponible'
) ENGINE=InnoDB;

INSERT IGNORE INTO mesas (nombre, capacidad, pos_x, pos_y, orden) VALUES
('Mesa 1', 4, 0, 0, 1), ('Mesa 2', 4, 1, 0, 2), ('Mesa 3', 4, 0, 1, 3),
('Mesa 4', 4, 1, 1, 4), ('Mesa 5', 6, 0, 2, 5);

-- Usuario administrador inicial (clave de INSTALACIÓN conocida: cámbiala
-- inmediatamente con un UPDATE de password_hash o desde Configuración >
-- Colaboradores. Nunca uses esta clave en producción).
-- Para generar un hash nuevo: php -r "echo password_hash('TU_CLAVE', PASSWORD_BCRYPT), PHP_EOL;"
INSERT INTO usuarios (username, password_hash, nombre, rol, activo, codigo_referencia)
VALUES ('admin', '$2y$10$LiWzTIY.328kbGxASOngTuICKF902ySOJTZlaNg3lkyoCtaLIIKAK', 'Administrador', 'admin', TRUE, 'ADM-001')
ON DUPLICATE KEY UPDATE nombre='Administrador', rol='admin', codigo_referencia=COALESCE(codigo_referencia, 'ADM-001');
