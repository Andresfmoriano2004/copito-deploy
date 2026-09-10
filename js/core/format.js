// Copito POS — Formato, fechas Bogotá, escape y helpers puros.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  fmt(n) {
    return this.CURRENCY.symbol + ' ' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

// ─── Fechas centralizadas (America/Bogota) ─────────────────────────────
  // ÚNICO punto de formateo del frontend. El backend ya envía los campos
  // fecha/hora/fechaHora preformateados; estas funciones son el fallback y
  // la vía para datetimes crudos 'Y-m-d H:i:s'.
  // El string MySQL se interpreta como hora LOCAL de Bogotá (wall time),
  // NUNCA como UTC: así se evita el desplazamiento de día/hora.

  _parseBogota(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    // 'YYYY-MM-DD HH:MM:SS' → construir como hora local (Bogotá) sin 'Z'
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      return isNaN(d) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  },


  fmtFecha(v) {
    // Acepta objeto con .fecha del backend, string crudo o Date
    if (v && typeof v === 'object' && !(v instanceof Date) && v.fecha) return v.fecha;
    const d = this._parseBogota(v);
    if (!d) return '';
    return d.toLocaleDateString('es-CO', { timeZone: this.TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  },


  fmtHora(v) {
    if (v && typeof v === 'object' && !(v instanceof Date) && v.hora) return v.hora;
    const d = this._parseBogota(v);
    if (!d) return '';
    // Normalizar AM/PM: algunos ICU devuelven "a. m."/"p. m." → unificar a "AM"/"PM"
    return d.toLocaleTimeString('es-CO', { timeZone: this.TZ, hour: '2-digit', minute: '2-digit', hour12: true })
      .toUpperCase().replace(/\s*A\.\s*M\./g, ' AM').replace(/\s*P\.\s*M\./g, ' PM').replace(/\s+/g, ' ').trim();
  },


  fmtFechaHora(v) {
    if (v && typeof v === 'object' && !(v instanceof Date) && v.fechaHora) return v.fechaHora;
    const d = this._parseBogota(v);
    if (!d) return '';
    return this.fmtFecha(d) + ' ' + this.fmtHora(d);
  },


  // Badge de estado reutilizable (pedidos, mesas, productos, caja)
  badgeEstado(estado) {
    const e = String(estado || '');
    const map = {
      'Abierto': 'badge-abierto', 'Cerrado': 'badge-cerrado', 'Cancelado': 'badge-cancelado',
      'Ocupada': 'badge-ocupada', 'En pago': 'badge-enpago', 'Disponible': 'badge-disponible',
      'Reservada': 'badge-reservada', 'INGRESO': 'badge-ingreso', 'SALIDA': 'badge-salida',
      'VENTA': 'badge-venta', 'EGRESO': 'badge-egreso', 'FISICO': 'badge-fisico', 'BANCARIO': 'badge-bancario',
      'Pagado': 'badge-cerrado', 'Pendiente': 'badge-abierto'
    };
    const cls = map[e] || 'badge-neutral';
    return `<span class="badge ${cls}">${this.escapeHtml(e)}</span>`;
  },


  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  },


  getCuentaIcon(cuenta) {
    const icons = { A: '🅰️', B: '🅱️', C: '🅲', D: '🅳', E: '🅴', F: '🅵', G: '🅶', H: '🅷' };
    return icons[cuenta] || `📍${cuenta}`;
  },


  getCuentaColor(cuenta) {
    const colors = ['var(--info-bg)', 'var(--warning-bg)', 'var(--success-bg)', 'var(--danger-bg)',
                    '#e8f5e9', '#fff3e0', '#f3e5f5', '#e0f7fa'];
    const textColors = ['var(--info-text)', 'var(--warning-text)', 'var(--success-text)', 'var(--danger-text)',
                        '#2e7d32', '#e65100', '#6a1b9a', '#00695c'];
    const idx = (cuenta ? cuenta.charCodeAt(0) - 65 : 0) % colors.length;
    return { bg: colors[idx], text: textColors[idx] };
  },


  getCuentasDelPedido(pedido) {
    const cuentas = new Set();
    if (pedido.items) pedido.items.forEach(i => { if (i.cuenta) cuentas.add(i.cuenta); });
    if (pedido.pagos) pedido.pagos.forEach(p => { if (p.cuenta) cuentas.add(p.cuenta); });
    return [...cuentas].sort();
  },


  getSiguienteCuenta(cuentasExistentes) {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const c of letras) { if (!cuentasExistentes.includes(c)) return c; }
    return 'Z';
  }
});
