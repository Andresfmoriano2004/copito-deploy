-- =====================================================
-- Migración v6: persistencia de cuentas en split bill
-- Ejecutar UNA sola vez (phpMyAdmin > SQL).
-- Agrega columna cuentas_activas a pedidos para que
-- las cuentas A, B, C... sobrevivan refrescos de página.
-- =====================================================

-- ─── APLICAR ────────────────────────────────────────
ALTER TABLE pedidos
  ADD COLUMN cuentas_activas VARCHAR(20) DEFAULT NULL AFTER cancelacion_motivo;

-- ─── ROLLBACK (ejecutar solo si hay problemas) ──────
-- ALTER TABLE pedidos DROP COLUMN cuentas_activas;
