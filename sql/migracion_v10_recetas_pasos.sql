-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN v10 — RECETAS DE PREPARACIÓN (procedimiento paso a paso)
-- ═══════════════════════════════════════════════════════════════════════════
-- Qué agrega:
--   1. receta_pasos  → el procedimiento ESCRITO de cada producto.
--
-- Por qué una tabla aparte de `recetas` (v7a):
--   `recetas` responde CUÁNTO ENTRA: insumo + cantidad por unidad, para
--   calcular costo y (más adelante) despachar materia prima.
--   `receta_pasos` responde CÓMO SE HACE: pasos ordenados con texto, tiempo y
--   equipo — "partir el pan, untar chipotle, poner jamón y queso, air fryer
--   5 min, encima queso crema, pimienta y hierbabuena".
--   Meter las dos cosas en una tabla habría obligado a parsear texto para
--   sacar el costo y a guardar cantidades donde no caben.
--
-- Relación: UN producto = UNA receta (decisión de diseño v10). Si algún día se
-- necesitan variantes del mismo producto, se agrega una cabecera con
-- `receta_id` — no se cambia el día de hoy.
--
-- Idempotente: puede ejecutarse N veces sin fallar (IF NOT EXISTS).
--
-- Orden de instalación:
--   dpcoffee.sql → v4 → v5 → v6 → v7 → v7a → v8 → v9 → **v10**

CREATE TABLE IF NOT EXISTS receta_pasos (
  id              INT          NOT NULL AUTO_INCREMENT,
  codigo_producto VARCHAR(20)  NOT NULL,
  orden           INT          NOT NULL,             -- 1..n, orden de la comanda
  titulo          VARCHAR(120) NULL,                 -- p.ej. "Hornear"
  instruccion     TEXT         NOT NULL,             -- cómo se hace, en una frase
  tiempo_min      DECIMAL(6,2) NULL,                 -- minutos de ese paso (5)
  equipo          VARCHAR(60)  NULL,                 -- Air Fryer, Horno, Microondas
  PRIMARY KEY (id),
  UNIQUE KEY uq_receta_paso (codigo_producto, orden),
  KEY ix_receta_pasos_producto (codigo_producto),
  CONSTRAINT fk_receta_pasos_producto
    FOREIGN KEY (codigo_producto) REFERENCES productos (codigo)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
