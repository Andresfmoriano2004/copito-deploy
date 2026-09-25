// ─── Reportes API ──────────────────────────────────────
async function obtenerReporteVentas(desde, hasta) {
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde); if (hasta) params.set('hasta', hasta);
  const qs = params.toString();
  return apiGet(`/pedidos/ventas/reporte${qs ? '?' + qs : ''}`);
}
async function obtenerReporteVentasSemanal(desde, hasta) {
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde); if (hasta) params.set('hasta', hasta);
  const qs = params.toString();
  return apiGet(`/pedidos/ventas/semanal${qs ? '?' + qs : ''}`);
}

// ─── Auditoría API ─────────────────────────────────────
async function obtenerAuditoria(filtros) {
  const params = new URLSearchParams();
  if (filtros) {
    if (filtros.pedido_id) params.set('pedido_id', filtros.pedido_id);
    if (filtros.usuario_id) params.set('usuario_id', filtros.usuario_id);
    if (filtros.operacion) params.set('operacion', filtros.operacion);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);
    if (filtros.limit) params.set('limit', filtros.limit);
    if (filtros.offset) params.set('offset', filtros.offset);
  }
  const qs = params.toString();
  return apiGet(`/auditoria${qs ? '?' + qs : ''}`);
}

// ─── Mantenimiento (admin) ─────────────────────────────
async function obtenerConteoRegistros() { return apiGet('/mantenimiento/conteo'); }
async function limpiarRegistros(modulos, confirmacion) { return apiPost('/mantenimiento/limpiar', { modulos, confirmacion }); }
