-- Migración v3: estados de mesa + semillas Mesa 4/5.
-- Ejecutar una sola vez en Hostinger (phpMyAdmin > SQL) DESPUÉS de migracion_v2.sql.
ALTER TABLE mesas ADD COLUMN estado_manual VARCHAR(20) NOT NULL DEFAULT 'Disponible';
INSERT IGNORE INTO mesas (nombre, capacidad, pos_x, pos_y, orden) VALUES
('Mesa 4', 4, 1, 1, 4), ('Mesa 5', 6, 0, 2, 5);
