// ─── Inventario API ──────────────────────────────────
async function obtenerMovimientos() { return apiGet('/movimientos'); }
async function registrarMovimiento(data) { return apiPost('/movimientos', data); }
async function obtenerStock() { return apiGet('/movimientos/stock'); }

// ─── Materia Prima ────────────────────────────────
async function obtenerMateriaPrima(q) { return apiGet('/materia-prima' + (q ? `?q=${encodeURIComponent(q)}` : '')); }
async function crearMateriaPrima(data) { return apiPost('/materia-prima', data); }
async function actualizarMateriaPrima(codigo, data) { return apiPut(`/materia-prima/${encodeURIComponent(codigo)}`, data); }
async function eliminarMateriaPrima(codigo) { return apiDelete(`/materia-prima/${encodeURIComponent(codigo)}`); }
async function registrarMovimientoMateriaPrima(data) { return apiPost('/materia-prima/movimiento', data); }
async function historialMateriaPrima(codigo) { return apiGet(`/materia-prima/historial/${encodeURIComponent(codigo)}`); }

// ─── Recetas ─────────────────────────────────────
async function obtenerRecetas(producto) { return apiGet('/recetas' + (producto ? `?producto=${encodeURIComponent(producto)}` : '')); }
async function crearReceta(data) { return apiPost('/recetas', data); }
async function actualizarReceta(id, data) { return apiPut(`/recetas/${id}`, data); }
async function eliminarReceta(id) { return apiDelete(`/recetas/${id}`); }

// ─── Consumos Internos (Gasto Personal) ──────────
async function obtenerConsumosInternos(persona) { return apiGet('/consumos-internos' + (persona ? `?persona=${encodeURIComponent(persona)}` : '')); }
async function obtenerResumenConsumos(desde, hasta) { return apiGet(`/consumos-internos/resumen?desde=${desde}&hasta=${hasta}`); }
async function registrarConsumoInterno(data) { return apiPost('/consumos-internos', data); }
async function eliminarConsumoInterno(id) { return apiDelete(`/consumos-internos/${id}`); }
