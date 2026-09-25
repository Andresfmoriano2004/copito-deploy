// ─── Usuarios API ──────────────────────────────────────
async function obtenerUsuarios() { return apiGet('/usuarios'); }
async function crearUsuario(data) { return apiPost('/usuarios', data); }
async function actualizarUsuario(id, data) { return apiPut(`/usuarios/${id}`, data); }
async function eliminarUsuario(id) { return apiDelete(`/usuarios/${id}`); }
