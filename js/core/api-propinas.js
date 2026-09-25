// ─── Propinas API ──────────────────────────────────────
async function registrarPropina(data) { return apiPost('/propinas', data); }
async function obtenerPropinas(filtros) {
  const params = new URLSearchParams();
  if (filtros) {
    if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta);
    if (filtros.lugar)       params.set('lugar', filtros.lugar);
    if (filtros.usuario_id)  params.set('usuario_id', filtros.usuario_id);
  }
  const qs = params.toString();
  return apiGet(`/propinas${qs ? '?' + qs : ''}`);
}
