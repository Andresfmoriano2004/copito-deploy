-- ═══════════════════════════════════════════════════════════
-- Migración v7a: Materia Prima y Recetas
-- Fecha: 2026-09-13
-- Ejecutar en phpMyAdmin > SQL > Pegar > Go
-- ═══════════════════════════════════════════════════════════

-- 1. Materia prima
CREATE TABLE IF NOT EXISTS materia_prima (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  unidad VARCHAR(50) NOT NULL,
  stock_minimo DECIMAL(12,2) DEFAULT 0,
  costo DECIMAL(14,2) DEFAULT 0,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Movimientos de materia prima
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

-- 3. Recetas: relación producto -> materia prima
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

-- 4. Unidades de medida para materia prima
INSERT IGNORE INTO unidades (nombre) VALUES ('Gramos'), ('Kilogramos'), ('Mililitros'), ('Litros'), ('Onzas'), ('Libras');
