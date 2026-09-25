// ─── Caja API ──────────────────────────────────────
async function obtenerCajaActiva() { return apiGet('/caja/activa'); }
async function abrirCaja(montoInicial) { return apiPost('/caja/abrir', { montoInicial }); }
async function registrarMovimientoCaja(data) { return apiPost('/caja/movimiento', data); }
async function obtenerResumenCaja() { return apiGet('/caja/resumen'); }
async function cerrarCaja(montoFisico, notas) { return apiPost('/caja/cerrar', { montoFisico, notas }); }
async function obtenerHistorialCaja() { return apiGet('/caja/historial'); }
async function obtenerPropinasCaja() { return apiGet('/caja/propinas'); }
