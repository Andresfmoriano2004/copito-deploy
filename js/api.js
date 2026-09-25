// Base dinámica: funciona en root (/) y en subcarpeta (/copito-deploy/).
// Usa location.origin para asegurar el mismo protocolo (HTTP o HTTPS).
const API_BASE = (() => {
  const p = window.location.pathname.replace(/\/[^\/]*\.(html|php)$/, '').replace(/\/$/, '');
  return location.origin + (p ? p : '') + '/api';
})();

function getToken() { return localStorage.getItem('dpcoffee-token'); }
function setToken(token) { localStorage.setItem('dpcoffee-token', token); }
function clearToken() { localStorage.removeItem('dpcoffee-token'); }

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

// Reintento automático ante cortes de red (móvil/ngrok).
// Solo reintenta cuando el servidor NUNCA respondió (fallo de red o
// respuesta sintética del SW con X-SW-Offline), así nunca duplica escrituras.
function _isOfflineFailure(res, err) {
  if (err && (err instanceof TypeError)) return true;
  if (res && res.headers && res.headers.get('X-SW-Offline') === '1') return true;
  return false;
}
async function fetchRetry(url, options, retries = 2) {
  let lastRes = null, lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!_isOfflineFailure(res, null)) return res;
      lastRes = res;
    } catch (e) {
      if (!_isOfflineFailure(null, e)) throw e;
      lastErr = e;
    }
    if (i < retries) await new Promise(r => setTimeout(r, 700 * (i + 1)));
  }
  if (lastRes) return lastRes;
  throw lastErr;
}

async function apiGet(path) {
  const res = await fetchRetry(API_BASE + path, { headers: { ...authHeaders() } });
  await handleAuth(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetchRetry(API_BASE + path, {
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
  const res = await fetchRetry(API_BASE + path, {
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
  const res = await fetchRetry(API_BASE + path, { method: 'DELETE', headers: { ...authHeaders() } });
  await handleAuth(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────
async function loginAuth(username, password) {
  const res = await fetchRetry(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    if (res.status === 503) throw new Error('Servidor no disponible temporalmente (503). Reintente en unos minutos.');
    if (res.status >= 500) throw new Error(`Error del servidor (${res.status}). Intente de nuevo.`);
    throw new Error(`Respuesta inesperada del servidor (${res.status || 'sin conexión'}). Verifique su red.`);
  }
  if (!res.ok) throw new Error(data.error || 'Error de autenticación');
  return data;
}

async function obtenerUsuarioActual() {
  const res = await fetchRetry(API_BASE + '/auth/me', { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('No autenticado');
  return res.json();
}
