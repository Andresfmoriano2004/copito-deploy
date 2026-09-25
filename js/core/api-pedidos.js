// ─── Pedidos API ──────────────────────────────────────
async function crearPedido(lugar, cliente) { return apiPost('/pedidos', { lugar, cliente }); }
async function obtenerPedidosActivos() { return apiGet('/pedidos/activos'); }
async function obtenerHistorialPedidos(filtros) {
  const params = new URLSearchParams();
  if (filtros) {
    if (filtros.fecha_desde) params.set('fecha_desde', filtros.fecha_desde);
    if (filtros.fecha_hasta) params.set('fecha_hasta', filtros.fecha_hasta);
    if (filtros.lugar) params.set('lugar', filtros.lugar);
    if (filtros.estado) params.set('estado', filtros.estado);
  }
  const qs = params.toString();
  return apiGet(`/pedidos/historial${qs ? '?' + qs : ''}`);
}
async function obtenerPedido(id) { return apiGet(`/pedidos/${id}`); }
async function agregarItemPedido(pedidoId, data) { return apiPost(`/pedidos/${pedidoId}/items`, data); }
async function modificarItemPedido(detalleId, data) { return apiPut(`/pedidos/items/${detalleId}`, data); }
async function eliminarItemPedido(detalleId) { return apiDelete(`/pedidos/items/${detalleId}`); }
async function cerrarPedido(pedidoId, pagos, cambio) { return apiPost(`/pedidos/${pedidoId}/cerrar`, { pagos, cambio }); }
function descargarPDFPedido(pedidoId) {
  if (window.Ticket && typeof window.Ticket.mostrarModal === 'function') {
    window.Ticket.mostrarModal(pedidoId);
  } else {
    window.open(API_BASE + `/pedidos/${pedidoId}/pdf`, '_blank');
  }
}
async function actualizarPedido(id, data) { return apiPut(`/pedidos/${id}`, data); }
async function cancelarPedido(id, motivo) { return apiPost(`/pedidos/${id}/cancelar`, { motivo }); }
async function cerrarCuentaPedido(pedidoId, cuenta, pagos, cambio) { return apiPost(`/pedidos/${pedidoId}/cerrar-cuenta`, { cuenta, pagos, cambio }); }
async function abonarCuenta(pedidoId, cuenta, pagos) { return apiPost(`/pedidos/${pedidoId}/abonar`, { cuenta, pagos }); }
async function cerrarItemPedido(pedidoId, detalleId, pagos, cambio) { return apiPost(`/pedidos/${pedidoId}/pagar-item`, { detalleId, pagos, cambio }); }
async function cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio, cuenta) { return apiPost(`/pedidos/${pedidoId}/pagar-items`, { detalleIds, pagos, cambio, cuenta }); }
async function obtenerCuentasPedido(pedidoId) { return apiGet(`/pedidos/${pedidoId}/cuentas`); }
async function obtenerPagosPedido(pedidoId) { return apiGet(`/pedidos/${pedidoId}/pagos`); }
