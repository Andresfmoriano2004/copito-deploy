// Base dinámica: funciona en root (/) y en subcarpeta (/copito-deploy/).
// /copito-deploy/ -> /copito-deploy/api | / -> /api
const API_BASE = (() => {
  const p = window.location.pathname.replace(/\/[^\/]*\.(html|php)$/, '').replace(/\/$/, '');
  return (p ? p : '') + '/api';
})();

function getToken() { return localStorage.getItem('dpcoffee-token'); }
function setToken(token) { localStorage.setItem('dpcoffee-token', token); }
function clearToken() { localStorage.removeItem('dpcoffee-token'); }

// Normaliza URL de imagen: la DB vieja guarda "/uploads/..." (absoluta a root),
// la nueva guarda "uploads/..." (relativa). Quita el slash inicial para que
// funcione en root y en subcarpeta (/copito-deploy/). Respeta http/data:.
function imgUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  return u.replace(/^\/+/, '');
}

function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

async function handleAuth(res) {
  if (res.status === 401) { clearToken(); window.location.reload(); throw new Error('Sesión expirada'); }
  return res;
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: { ...authHeaders() } });
  await handleAuth(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  await handleAuth(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  await handleAuth(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: 'DELETE', headers: { ...authHeaders() } });
  await handleAuth(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function subirImagenProducto(codigo, file) {
  const form = new FormData();
  form.append('imagen', file);
  const res = await fetch(API_BASE + `/productos/${encodeURIComponent(codigo)}/imagen`, { method: 'POST', headers: { ...authHeaders() }, body: form });
  await handleAuth(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ─── Auth ─────────────────────────────────────────────
async function loginAuth(username, password) {
  const res = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    // Respuesta no-JSON: normalmente página de error del hosting (503 mantenimiento/
    // sobrecarga) o corte a mitad de respuesta. El estado sí distingue la causa.
    if (res.status === 503) throw new Error('Servidor no disponible temporalmente (503). Reintente en unos minutos.');
    if (res.status >= 500) throw new Error(`Error del servidor (${res.status}). Intente de nuevo.`);
    throw new Error(`Respuesta inesperada del servidor (${res.status || 'sin conexión'}). Verifique su red.`);
  }
  if (!res.ok) throw new Error(data.error || 'Error de autenticación');
  return data;
}

async function obtenerUsuarioActual() {
  const res = await fetch(API_BASE + '/auth/me', { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('No autenticado');
  return res.json();
}

// ─── Productos ─────────────────────────────────────
// Fase 2: sin args = array legacy. Con {q,page,limit} = envelope {data,total,page,limit}.
async function obtenerProductos(qOrOpts) {
  let qs = '';
  if (qOrOpts && typeof qOrOpts === 'object') {
    const params = new URLSearchParams();
    if (qOrOpts.q && String(qOrOpts.q).trim()) params.set('q', String(qOrOpts.q).trim());
    if (qOrOpts.page) params.set('page', qOrOpts.page);
    if (qOrOpts.limit) params.set('limit', qOrOpts.limit);
    qs = params.toString() ? `?${params.toString()}` : '';
  } else if (qOrOpts && String(qOrOpts).trim()) {
    qs = `?q=${encodeURIComponent(String(qOrOpts).trim())}`;
  }
  return apiGet(`/productos${qs}`);
}
// Normaliza array legacy o envelope paginado a {data,total,page,limit}.
function normPagina(res, fallbackLimit) {
  if (res && Array.isArray(res.data)) {
    return { data: res.data, total: res.total ?? res.data.length,
             page: res.page ?? 1, limit: res.limit ?? fallbackLimit ?? res.data.length };
  }
  const arr = Array.isArray(res) ? res : [];
  return { data: arr, total: arr.length, page: 1, limit: fallbackLimit ?? arr.length };
}
async function buscarProductos(q) { return obtenerProductos(q); }
async function obtenerProducto(codigo) { return apiGet(`/productos/${encodeURIComponent(codigo)}`); }
async function registrarProducto(data) { return apiPost('/productos', data); }
async function actualizarProducto(codigo, data) { return apiPut(`/productos/${encodeURIComponent(codigo)}`, data); }
async function eliminarProducto(codigo) { return apiDelete(`/productos/${encodeURIComponent(codigo)}`); }

// ─── Movimientos / Stock ────────────────────────────
async function obtenerMovimientos() { return apiGet('/movimientos'); }
async function registrarMovimiento(data) { return apiPost('/movimientos', data); }
async function obtenerStock() { return apiGet('/movimientos/stock'); }

// ─── Grupos ────────────────────────────────────────
async function obtenerGrupos() { return apiGet('/grupos'); }
async function crearGrupo(nombre) { return apiPost('/grupos', { nombre }); }
async function eliminarGrupo(nombre) { return apiDelete(`/grupos/${encodeURIComponent(nombre)}`); }

// ─── Unidades ──────────────────────────────────────
async function obtenerUnidades() { return apiGet('/unidades'); }
async function crearUnidad(nombre) { return apiPost('/unidades', { nombre }); }
async function eliminarUnidad(nombre) { return apiDelete(`/unidades/${encodeURIComponent(nombre)}`); }

// ─── Proveedores ─────────────────────────────────
async function obtenerProveedores(todos) { return apiGet(todos ? '/proveedores?todos=1' : '/proveedores'); }
async function crearProveedor(data) { return apiPost('/proveedores', data); }
async function actualizarProveedor(id, data) { return apiPut(`/proveedores/${id}`, data); }
async function eliminarProveedor(id) { return apiDelete(`/proveedores/${id}`); }

// ─── Pedidos ───────────────────────────────────────
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
async function obtenerMesas() { return apiGet('/mesas'); }
async function actualizarMesa(id, data) { return apiPut(`/mesas/${id}`, data); }

// ─── Valoración ────────────────────────────────────
async function obtenerValoracionInventario() { return apiGet('/productos/valoracion'); }

// ─── Split bill ────────────────────────────────────
async function cerrarCuentaPedido(pedidoId, cuenta, pagos, cambio) { return apiPost(`/pedidos/${pedidoId}/cerrar-cuenta`, { cuenta, pagos, cambio }); }
// Abono parcial (acumulable, ilimitado): { cuenta|null, pagos } → { acumulado, pendiente, cuentaCerrada, pedidoCerrado }
async function abonarCuenta(pedidoId, cuenta, pagos) { return apiPost(`/pedidos/${pedidoId}/abonar`, { cuenta, pagos }); }
async function cerrarItemPedido(pedidoId, detalleId, pagos, cambio) { return apiPost(`/pedidos/${pedidoId}/pagar-item`, { detalleId, pagos, cambio }); }
async function cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio) { return apiPost(`/pedidos/${pedidoId}/pagar-items`, { detalleIds, pagos, cambio }); }

// ─── Reportes ──────────────────────────────────────
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
async function obtenerCuentasPedido(pedidoId) { return apiGet(`/pedidos/${pedidoId}/cuentas`); }
async function obtenerPagosPedido(pedidoId) { return apiGet(`/pedidos/${pedidoId}/pagos`); }

// ─── Caja ──────────────────────────────────────────
async function obtenerCajaActiva() { return apiGet('/caja/activa'); }
async function abrirCaja(montoInicial) { return apiPost('/caja/abrir', { montoInicial }); }
async function registrarMovimientoCaja(data) { return apiPost('/caja/movimiento', data); }
async function obtenerResumenCaja() { return apiGet('/caja/resumen'); }
async function cerrarCaja(montoFisico, notas) { return apiPost('/caja/cerrar', { montoFisico, notas }); }
async function obtenerHistorialCaja() { return apiGet('/caja/historial'); }

// ─── Usuarios ──────────────────────────────────────
async function obtenerUsuarios() { return apiGet('/usuarios'); }
async function crearUsuario(data) { return apiPost('/usuarios', data); }
async function actualizarUsuario(id, data) { return apiPut(`/usuarios/${id}`, data); }
async function eliminarUsuario(id) { return apiDelete(`/usuarios/${id}`); }

// ─── Mantenimiento (admin) ─────────────────────────────
// Limpieza SELECTIVA: nunca toca usuarios/productos/grupos/unidades/mesas.
async function obtenerConteoRegistros() { return apiGet('/mantenimiento/conteo'); }
async function limpiarRegistros(modulos, confirmacion) { return apiPost('/mantenimiento/limpiar', { modulos, confirmacion }); }

// ─── Auditoría ─────────────────────────────────────
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
