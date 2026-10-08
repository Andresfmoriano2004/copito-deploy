-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN v9 — FACTURACIÓN (Comprobante de venta / "Camino A")
-- ═══════════════════════════════════════════════════════════════════════════
-- Qué agrega:
--   1. configuraciones            → datos del emisor (antes hardcodeados en
--                                    js/ticket.js:7-15 y pedidos_detail.php:89-93)
--   2. facturacion_consecutivos   → prefijo + numeración (simula la resolución)
--   3. facturas                   → comprobante emitido, uno por pedido
--   4. Columnas fiscales en productos, detalle_pedido y pedidos
--
-- Idempotente: puede ejecutarse N veces sin fallar. MySQL no acepta
-- `ADD COLUMN IF NOT EXISTS`, así que se usan dos procedimientos que consultan
-- information_schema antes de cada ALTER.
--
-- Orden de instalación:
--   dpcoffee.sql → v4 → v5 → v6 → v7 → v7a → v8 → **v9**
--
-- Política de IVA (decisión de negocio):
--   `productos.precio` INCLUYE el IVA (es lo que ve el cliente en el menú).
--   La factura desgrana la base:
--       base = round(subtotal / (1 + iva/100), 2)
--       iva  = round(subtotal - base, 2)          ← se resta, no se recalcula,
--   de modo que base + iva == subtotal EXACTAMENTE, sin descuadre de centavos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tablas nuevas ───────────────────────────────────────────────────────

-- Datos del emisor y ajustes en pares clave/valor.
CREATE TABLE IF NOT EXISTS configuraciones (
  clave VARCHAR(60) NOT NULL PRIMARY KEY,
  valor TEXT NULL,
  descripcion VARCHAR(160) NULL,
  actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Numeración autorizada (en Camino A simula la resolución de la DIAN).
CREATE TABLE IF NOT EXISTS facturacion_consecutivos (
  prefijo VARCHAR(10) NOT NULL PRIMARY KEY,
  siguiente INT UNSIGNED NOT NULL DEFAULT 1,
  numero_hasta INT UNSIGNED NOT NULL DEFAULT 999999,
  resolucion VARCHAR(120) NULL,
  vigencia_desde DATE NULL,
  vigencia_hasta DATE NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Comprobante emitido. Snapshot fiscal de los totales al momento de emitir;
-- las líneas se leen de detalle_pedido, que queda inmutable al salir de 'Abierto'
-- (pedidos_crud.php:164 POST items, :224 PUT items, :269 DELETE items).
CREATE TABLE IF NOT EXISTS facturas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(30) NOT NULL,               -- p.ej. FEV-000001
  prefijo VARCHAR(10) NOT NULL,
  consecutivo INT UNSIGNED NOT NULL,
  id_pedido VARCHAR(20) NOT NULL,
  fecha_emision DATETIME NOT NULL,
  estado ENUM('Emitida','Anulada') NOT NULL DEFAULT 'Emitida',
  lugar VARCHAR(50) NULL,
  forma_pago VARCHAR(30) NOT NULL DEFAULT 'Contado',   -- Contado | Crédito
  cliente_nombre VARCHAR(200) NULL,
  cliente_nit VARCHAR(15) NULL,              -- solo dígitos
  cliente_dv CHAR(1) NULL,
  cliente_direccion VARCHAR(200) NULL,
  cliente_email VARCHAR(150) NULL,
  cliente_regimen VARCHAR(30) NULL,
  total_base DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_descuentos DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- Firmados a propósito: deben calzar con usuarios.id INT AUTO_INCREMENT.
  -- (INT UNSIGNED en la FK da errno 150 "incorrectly formed".)
  emitida_por INT NULL,
  anulada_motivo VARCHAR(255) NULL,
  anulada_en DATETIME NULL,
  anulada_por INT NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_facturas_numero (numero),
  UNIQUE KEY uq_facturas_pedido (id_pedido),
  KEY ix_facturas_fecha (fecha_emision),
  KEY ix_facturas_estado (estado),
  CONSTRAINT fk_facturas_pedido
    FOREIGN KEY (id_pedido) REFERENCES pedidos (id_pedido)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_facturas_emitida_por
    FOREIGN KEY (emitida_por) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_facturas_anulada_por
    FOREIGN KEY (anulada_por) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─── 2. Procedimientos auxiliares idempotentes ──────────────────────────────

DELIMITER $$

DROP PROCEDURE IF EXISTS agregar_columna$$
CREATE PROCEDURE agregar_columna(
  IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion VARCHAR(500)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_tabla
      AND COLUMN_NAME = p_columna
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN `', p_columna, '` ', p_definicion);
    PREPARE st FROM @s;
    EXECUTE st;
    DEALLOCATE PREPARE st;
  END IF;
END$$

DROP PROCEDURE IF EXISTS agregar_indice$$
CREATE PROCEDURE agregar_indice(
  IN p_tabla VARCHAR(64), IN p_indice VARCHAR(64), IN p_definicion VARCHAR(500)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_tabla
      AND INDEX_NAME = p_indice
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', p_tabla, '` ADD INDEX `', p_indice, '` ', p_definicion);
    PREPARE st FROM @s;
    EXECUTE st;
    DEALLOCATE PREPARE st;
  END IF;
END$$

DELIMITER ;

-- ─── 3. productos: datos fiscales del artículo ──────────────────────────────

CALL agregar_columna('productos', 'codigo_barras',    'VARCHAR(20) NULL');
CALL agregar_columna('productos', 'iva_porcentaje',   'DECIMAL(5,2) NOT NULL DEFAULT 19.00');
CALL agregar_columna('productos', 'tipo_item',        "ENUM('Bien','Servicio') NOT NULL DEFAULT 'Bien'");

-- ─── 4. detalle_pedido: snapshot fiscal de cada línea ───────────────────────
-- Se llena al agregar/editar el ítem y NO se toca después: el pedido cerrado
-- es inmutable, así la factura siempre refleja lo que realmente se cobró.

CALL agregar_columna('detalle_pedido', 'unidad',        "VARCHAR(50) NOT NULL DEFAULT 'Und'");
CALL agregar_columna('detalle_pedido', 'tipo_item',     "ENUM('Bien','Servicio') NOT NULL DEFAULT 'Bien'");
CALL agregar_columna('detalle_pedido', 'iva_porcentaje','DECIMAL(5,2) NOT NULL DEFAULT 19.00');
CALL agregar_columna('detalle_pedido', 'base_gravable', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
CALL agregar_columna('detalle_pedido', 'iva_valor',     'DECIMAL(14,2) NOT NULL DEFAULT 0');

-- ─── 5. pedidos: totales fiscales + datos del cliente ───────────────────────

CALL agregar_columna('pedidos', 'numero_factura',    'VARCHAR(30) NULL');
CALL agregar_columna('pedidos', 'forma_pago',        "VARCHAR(30) NOT NULL DEFAULT 'Contado'");
CALL agregar_columna('pedidos', 'total_base',        'DECIMAL(14,2) NOT NULL DEFAULT 0');
CALL agregar_columna('pedidos', 'total_iva',         'DECIMAL(14,2) NOT NULL DEFAULT 0');
CALL agregar_columna('pedidos', 'total_descuentos',  'DECIMAL(14,2) NOT NULL DEFAULT 0');
CALL agregar_columna('pedidos', 'cliente_nit',       'VARCHAR(15) NULL');
CALL agregar_columna('pedidos', 'cliente_dv',        'CHAR(1) NULL');
CALL agregar_columna('pedidos', 'cliente_direccion', 'VARCHAR(200) NULL');
CALL agregar_columna('pedidos', 'cliente_email',     'VARCHAR(150) NULL');
CALL agregar_columna('pedidos', 'cliente_regimen',   'VARCHAR(30) NULL');

CALL agregar_indice('pedidos', 'ix_pedidos_numero_factura', '(numero_factura)');

-- ─── 6. Semillas ────────────────────────────────────────────────────────────
-- Valores que hoy están escritos a mano en js/ticket.js:7-15.
INSERT IGNORE INTO configuraciones (clave, valor, descripcion) VALUES
  ('empresa.nombre_comercial',        'Dark Pink Coffee',               'Nombre que encabeza la factura'),
  ('empresa.razon_social',            'Dark Pink Coffee',               'Razón social / NIT a nombre de'),
  ('empresa.subtitulo',               'Cafetería & Pastelería Artesanal','Línea bajo el nombre'),
  ('empresa.nit',                     '901234567',                      'NIT del emisor, solo dígitos'),
  ('empresa.dv',                      '8',                              'Dígito de verificación del NIT'),
  ('empresa.direccion',               'Calle Principal # 10-20',        'Dirección del emisor'),
  ('empresa.ciudad',                  '',                               'Ciudad del emisor'),
  ('empresa.telefono',                '300 123 4567',                   'Teléfono del emisor'),
  ('empresa.regimen',                 'Común',                          'Régimen: Comón o Simplificado'),
  ('empresa.actividad_economica',     '',                               'Código CIIU de la actividad'),
  ('empresa.mensaje_pie',             '¡Gracias por su visita!',        'Primera línea del pie'),
  ('empresa.pie_secundario',          'Vuelva pronto ☕',                 'Segunda línea del pie'),
  ('facturacion.porcentaje_iva',      '19',                             'IVA por defecto de nuevo producto'),
  ('facturacion.activo',              '1',                              '1 = emite comprobante al cerrar');

INSERT IGNORE INTO facturacion_consecutivos
  (prefijo, siguiente, numero_hasta, resolucion, vigencia_desde, vigencia_hasta, activo)
VALUES
  ('FEV', 1, 999999, 'SIMULADA - pendiente resolución DIAN', CURRENT_DATE, NULL, 1);

-- ─── 7. Limpieza ────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS agregar_columna;
DROP PROCEDURE IF EXISTS agregar_indice;
