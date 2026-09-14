-- ═══════════════════════════════════════════════════════════
-- Migración v7: Propinas, Recetas/Materia Prima, Consumo Interno
-- Fecha: 2026-09-13
-- ═══════════════════════════════════════════════════════════

-- 1. PROPINA INDEPENDIENTE en pedidos
ALTER TABLE pedidos
  ADD COLUMN propina DECIMAL(14,2) DEFAULT 0 AFTER total,
  ADD COLUMN propina_pagada BOOLEAN DEFAULT FALSE AFTER propina;

-- 2. Distribución de propina entre personas
CREATE TABLE IF NOT EXISTS propina_distribucion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido VARCHAR(20) NOT NULL,
  persona VARCHAR(100) NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  pagado BOOLEAN DEFAULT FALSE,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 3. Materia prima (independiente de productos terminados)
CREATE TABLE IF NOT EXISTS materia_prima (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  unidad VARCHAR(50) NOT NULL,
  stock_minimo DECIMAL(12,2) DEFAULT 0,
  costo DECIMAL(14,2) DEFAULT 0,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. Movimientos de materia prima
CREATE TABLE IF NOT EXISTS movimientos_materia_prima (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_materia_prima VARCHAR(20) NOT NULL,
  tipo ENUM('INGRESO','SALIDA') NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  notas TEXT,
  usuario_id INT DEFAULT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (codigo_materia_prima) REFERENCES materia_prima(codigo) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_mp_producto (codigo_materia_prima),
  INDEX idx_mp_fecha (fecha)
) ENGINE=InnoDB;

-- 5. Recetas: relación producto -> materia prima
CREATE TABLE IF NOT EXISTS recetas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_producto VARCHAR(20) NOT NULL,
  codigo_materia_prima VARCHAR(20) NOT NULL,
  cantidad DECIMAL(12,4) NOT NULL,
  notas TEXT,
  FOREIGN KEY (codigo_producto) REFERENCES productos(codigo) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (codigo_materia_prima) REFERENCES materia_prima(codigo) ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE KEY uq_receta (codigo_producto, codigo_materia_prima)
) ENGINE=InnoDB;

-- 6. Consumo interno (cuenta de Angie)
CREATE TABLE IF NOT EXISTS consumos_internos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  persona VARCHAR(100) NOT NULL,
  codigo_producto VARCHAR(20) NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  notas TEXT,
  usuario_id INT DEFAULT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (codigo_producto) REFERENCES productos(codigo) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_ci_persona (persona),
  INDEX idx_ci_fecha (fecha)
) ENGINE=InnoDB;

-- Índices para propina_distribucion
CREATE INDEX idx_pd_pedido ON propina_distribucion(id_pedido);
