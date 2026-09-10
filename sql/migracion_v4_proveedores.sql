-- Migración v4: catálogo de proveedores.
-- Ejecutar una sola vez (phpMyAdmin > SQL). Idempotente.
CREATE TABLE IF NOT EXISTS proveedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  contacto VARCHAR(100) DEFAULT NULL,
  telefono VARCHAR(30) DEFAULT NULL,
  telefono2 VARCHAR(30) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  direccion VARCHAR(200) DEFAULT NULL,
  direccion2 VARCHAR(200) DEFAULT NULL,
  nit VARCHAR(30) DEFAULT NULL,
  comentarios TEXT DEFAULT NULL,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
