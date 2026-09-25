// ─── Mesas API ──────────────────────────────────────
async function obtenerMesas() { return apiGet('/mesas'); }
async function actualizarMesa(id, data) { return apiPut(`/mesas/${id}`, data); }
