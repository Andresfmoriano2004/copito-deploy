// ─── Productos API ──────────────────────────────────────
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
async function subirImagenProducto(codigo, file) {
  const form = new FormData();
  form.append('imagen', file);
  const res = await fetch(API_BASE + `/productos/${encodeURIComponent(codigo)}/imagen`, { method: 'POST', headers: { ...authHeaders() }, body: form });
  await handleAuth(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

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

// ─── Valoración ────────────────────────────────────
async function obtenerValoracionInventario() { return apiGet('/productos/valoracion'); }
