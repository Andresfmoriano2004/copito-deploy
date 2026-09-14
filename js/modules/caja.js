// Copito POS — Caja (apertura, movimientos, cierre, historial).
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== CAJA ==================
  cargarCaja() {
    const container = document.querySelector('#caja .content-body');
    if (!container) return;
    obtenerCajaActiva().then(caja => {
      if (!caja) {
        container.innerHTML = `
          <div class="card caja-estado-card caja-cerrada"><div class="card-body">
            <div class="caja-estado-row">
              <span class="caja-estado-dot" aria-hidden="true">🔴</span>
              <div>
                <div class="caja-estado-titulo">Caja cerrada</div>
                <div class="caja-estado-sub">No hay caja abierta. Registre la apertura para iniciar el día.</div>
              </div>
              ${this.badgeEstado('Disponible')}
            </div>
          </div></div>
          <div class="card"><div class="card-header">💰 Apertura de Caja</div><div class="card-body">
            <div class="form-grid" style="max-width:400px;">
              <div class="form-group"><label for="cajaMontoInicial">Monto Inicial (efectivo en caja)</label><input id="cajaMontoInicial" type="number" min="0" step="100" value="0"></div>
            </div>
            <div class="actions"><button class="btn btn-success" data-action="abrir-caja" type="button">🟢 Abrir Caja</button></div>
            <div id="cajaMsg" aria-live="polite"></div>
          </div></div>
          <div class="card"><div class="card-header">📜 Historial de Cierres</div><div class="card-body"><div id="cajaHistorial"></div></div></div>`;
        this.cargarHistorialCaja();
        return;
      }

      // Caja activa - show resumen with FISICO/BANCARIO separation
      Promise.all([obtenerResumenCaja(), obtenerPropinasCaja()]).then(([r, rProp]) => {
        if (!r) { container.innerHTML = '<div class="message info">Error al cargar resumen</div>'; return; }
        const totalPagos = r.totalVentas + r.totalIngresos;
        const nMovs = (r.movimientos || []).length;
        const totalPropinas = rProp ? rProp.totalPropinas : 0;
        const propinas = rProp ? (rProp.propinas || []) : [];
        container.innerHTML = `
          <div class="card caja-estado-card caja-abierta"><div class="card-body">
            <div class="caja-estado-row">
              <span class="caja-estado-dot pulse" aria-hidden="true">🟢</span>
              <div>
                <div class="caja-estado-titulo">Caja abierta · #${r.id || caja.id}</div>
                <div class="caja-estado-sub">📅 Apertura: <strong>${caja.fechaHoraApertura || r.fechaHoraApertura || this.fmtFechaHora(caja.fechaApertura)}</strong> · 🕐 ${caja.horaApertura || r.horaApertura || this.fmtHora(caja.fechaApertura)} · 💵 Inicial: <strong>${this.fmt(r.montoInicial)}</strong></div>
              </div>
              ${this.badgeEstado('Abierto')}
            </div>
          </div></div>
          <div class="kpi-grid">
            <div class="stat-card kpi-ventas"><div class="stat-value">${this.fmt(r.totalVentas)}</div><div class="stat-label">🛒 Total de ventas</div></div>
            <div class="stat-card kpi-pagos"><div class="stat-value">${this.fmt(totalPagos)}</div><div class="stat-label">💰 Pagos recibidos (ventas + ingresos)</div></div>
            <div class="stat-card kpi-movs"><div class="stat-value">${nMovs}</div><div class="stat-label">📜 Movimientos del día</div></div>
            <div class="stat-card kpi-saldo"><div class="stat-value">${this.fmt(r.totalEsperado)}</div><div class="stat-label">✅ Saldo disponible (esperado)</div></div>
            <div class="stat-card" style="background:linear-gradient(135deg,#fce4ec,#f8bbd0);border-left:4px solid #e91e8c;"><div class="stat-value" style="color:#c2185b;">${this.fmt(totalPropinas)}</div><div class="stat-label" style="color:#880e4f;">💝 Propinas del día</div></div>
          </div>
          <div class="caja-split">
            <div class="card"><div class="card-header">💵 FÍSICO (Efectivo)</div><div class="card-body">
              <div class="caja-line"><span>Ventas en efectivo</span><strong>${this.fmt(r.efectivoVentas)}</strong></div>
              <div class="caja-line"><span>Ingresos</span><strong>${this.fmt(r.efectivoIngresos)}</strong></div>
              <div class="caja-line"><span>Egresos</span><strong>− ${this.fmt(r.efectivoEgresos)}</strong></div>
              <hr class="caja-hr">
              <div class="caja-total caja-total-fisico"><span>Total físico</span><span>${this.fmt(r.totalFisico)}</span></div>
            </div></div>
            <div class="card"><div class="card-header">🏦 BANCARIO (Transferencias)</div><div class="card-body">
              <div class="caja-line"><span>Ventas bancarias</span><strong>${this.fmt(r.bancarioVentas)}</strong></div>
              <div class="caja-line"><span>Ingresos</span><strong>${this.fmt(r.bancarioIngresos)}</strong></div>
              <div class="caja-line"><span>Egresos</span><strong>− ${this.fmt(r.bancarioEgresos)}</strong></div>
              <hr class="caja-hr">
              <div class="caja-total caja-total-bancario"><span>Total bancario</span><span>${this.fmt(r.totalBancario)}</span></div>
            </div></div>
          </div>
          <div class="card" style="border-top:3px solid #e91e8c;">
            <div class="card-header" style="color:#c2185b;">💝 Propinas del Día <span style="font-size:0.8rem;font-weight:400;margin-left:8px;color:var(--text-muted);">(Independiente de ventas)</span></div>
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding:10px;background:#fce4ec;border-radius:8px;">
                <span style="color:#880e4f;">💵 Efectivo: <strong>${this.fmt(rProp?.efectivoPropinas || 0)}</strong></span>
                <span style="color:#880e4f;">🏦 Transferencia: <strong>${this.fmt(rProp?.bancarioPropinas || 0)}</strong></span>
                <span style="color:#c2185b;font-weight:700;">Total propinas: <strong>${this.fmt(totalPropinas)}</strong></span>
              </div>
              <div class="actions" style="margin-bottom:12px;">
                <button class="btn" data-action="propina-general" type="button" style="background:#e91e8c;color:white;border:none;font-weight:600;">💝 Registrar Propina General</button>
              </div>
              ${propinas.length ? `
              <div class="table-container"><table class="tabla-responsive">
                <thead><tr><th>Fecha</th><th>Hora</th><th>Mesa/Pedido</th><th>Usuario</th><th>Método</th><th style="text-align:right;">Propina</th></tr></thead>
                <tbody>${propinas.map(p => `<tr>
                  <td data-label="Fecha">${p.fechaCorta || this.fmtFecha(p.fecha)}</td>
                  <td data-label="Hora">${p.hora || this.fmtHora(p.fecha)}</td>
                  <td data-label="Mesa/Pedido">${p.pedidoId ? `<strong>${this.escapeHtml(p.pedidoId)}</strong>${p.lugar ? ' · ' + this.escapeHtml(p.lugar) : ''}` : '<em style="color:var(--text-muted);">Propina general</em>'}</td>
                  <td data-label="Usuario">${this.escapeHtml(p.usuario || '—')}</td>
                  <td data-label="Método"><span class="badge ${p.metodoPago === 'Efectivo' ? 'badge-cerrado' : 'badge-info'}">${this.escapeHtml(p.metodoPago || '')}</span></td>
                  <td data-label="Propina" style="font-weight:700;text-align:right;color:#c2185b;">${this.fmt(p.monto)}</td>
                </tr>`).join('')}</tbody>
              </table></div>` : '<div class="message info">No hay propinas registradas en esta sesión</div>'}
            </div>
          </div>
          <div class="card"><div class="card-header">📋 Ingreso / Egreso Manual</div><div class="card-body">
            <div class="form-grid caja-form-grid">
              <div class="form-group"><label>Tipo</label><select id="cajaMovTipo"><option value="INGRESO">INGRESO</option><option value="EGRESO">EGRESO</option></select></div>
              <div class="form-group"><label>Método</label><select id="cajaMovMetodo"><option value="Efectivo">💵 Efectivo</option><option value="Transferencia">🏦 Transferencia bancaria</option></select></div>
              <div class="form-group"><label>Monto</label><input id="cajaMovMonto" type="number" min="0" step="100"></div>
              <div class="form-group"><label>Descripción</label><input id="cajaMovDesc" type="text" placeholder="Ej: Pago proveedor"></div>
            </div>
            <div class="actions"><button class="btn btn-primary" data-action="registrar-mov-caja" type="button">Registrar</button></div>
            <div id="cajaMovMsg" aria-live="polite"></div>
          </div></div>
          <div class="card"><div class="card-header">📜 Movimientos del Día</div><div class="card-body">
            <div class="table-container"><table class="tabla-responsive"><thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Pago</th><th>Medio</th><th>Descripción</th><th style="text-align:right;">Monto</th></tr></thead>
              <tbody>${(r.movimientos || []).map(m => `<tr>
                <td data-label="Fecha">${m.fechaCorta || this.fmtFecha(m.fecha)}</td>
                <td data-label="Hora">${m.hora || this.fmtHora(m.fecha)}</td>
                <td data-label="Tipo">${this.badgeEstado(m.tipo)}</td>
                <td data-label="Pago">${this.escapeHtml(m.metodoPago || '')}</td>
                <td data-label="Medio">${this.badgeEstado(m.tipoPago || 'FISICO')}</td>
                <td data-label="Descripción">${this.escapeHtml(m.descripcion || '')}</td>
                <td data-label="Monto" style="font-weight:600;text-align:right;">${this.fmt(m.monto)}</td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Sin movimientos registrados</td></tr>'}</tbody></table>
            </div>
          </div></div>
          <div class="actions" style="margin-top:10px;">
            <button class="btn btn-danger" data-action="cerrar-caja-modal" type="button">🔴 Cerrar Caja</button>
          </div>`;
      });
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },


  abrirCajaHandler() {
    const monto = Math.round(parseFloat(document.getElementById('cajaMontoInicial')?.value) || 0);
    abrirCaja(monto)
      .then(res => { this.showMessage('cajaMsg', res.mensaje, 'success'); this.cargarCaja(); })
      .catch(err => { this.showMessage('cajaMsg', 'Error: ' + err.message, 'error'); });
  },


  registrarMovCaja() {
    const tipo = document.getElementById('cajaMovTipo')?.value;
    const metodoPago = document.getElementById('cajaMovMetodo')?.value || 'Efectivo';
    const monto = Math.round(parseFloat(document.getElementById('cajaMovMonto')?.value) || 0);
    const descripcion = document.getElementById('cajaMovDesc')?.value?.trim() || '';
    if (!tipo || !monto) return this.showMessage('cajaMovMsg', 'Complete tipo y monto', 'error');
    registrarMovimientoCaja({ tipo, metodoPago, monto, descripcion })
      .then(res => { this.showMessage('cajaMovMsg', res.mensaje, 'success'); this.cargarCaja(); })
      .catch(err => { this.showMessage('cajaMovMsg', 'Error: ' + err.message, 'error'); });
  },


  cerrarCajaModal() {
    obtenerResumenCaja().then(r => {
      if (!r) return;
      this.cerrarModal();
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:480px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
        <h3 style="color:var(--primary);margin-bottom:5px;">🔴 Cierre de Caja</h3>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:15px;">📅 Apertura: <strong>${r.fechaHoraApertura || this.fmtFechaHora(r.fechaApertura)}</strong> · 💵 Inicial: <strong>${this.fmt(r.montoInicial)}</strong></p>
        <div style="padding:12px;background:var(--success-bg);border-radius:8px;margin-bottom:15px;border:1px solid var(--success-border);">
          <div style="font-weight:700;margin-bottom:8px;color:var(--success-text);">💵 FÍSICO (Efectivo en caja)</div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>Monto Inicial</span><strong>${this.fmt(r.montoInicial)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>+ Ventas Efectivo</span><strong>${this.fmt(r.efectivoVentas)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>+ Ingresos Físico</span><strong>${this.fmt(r.efectivoIngresos)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>- Egresos Físico</span><strong>${this.fmt(r.efectivoEgresos)}</strong></div>
          <hr style="border-color:var(--success-border);margin:6px 0;">
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:700;color:var(--success-text);"><span>Efectivo Esperado</span><span>${this.fmt(r.totalFisico)}</span></div>
        </div>
        <div style="padding:12px;background:var(--info-bg);border-radius:8px;margin-bottom:15px;border:1px solid var(--info-border);">
          <div style="font-weight:700;margin-bottom:8px;color:var(--info-text);">🏦 BANCARIO (Transferencias)</div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>+ Ventas Bancarias</span><strong>${this.fmt(r.bancarioVentas)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>+ Ingresos Bancarios</span><strong>${this.fmt(r.bancarioIngresos)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9rem;"><span>- Egresos Bancarios</span><strong>${this.fmt(r.bancarioEgresos)}</strong></div>
          <hr style="border-color:var(--info-border);margin:6px 0;">
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:700;color:var(--info-text);"><span>Total Bancario</span><span>${this.fmt(r.totalBancario)}</span></div>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px;background:var(--primary-bg-light);border-radius:8px;margin-bottom:15px;font-size:1.2rem;font-weight:700;color:var(--primary-dark);"><span>💵 Total General Esperado</span><span>${this.fmt(r.totalEsperado)}</span></div>
        <div class="form-group" style="margin-bottom:15px;">
          <label for="cajaMontoFisico">💰 Efectivo Físico en Caja</label>
          <input id="cajaMontoFisico" type="number" min="0" step="100" value="${r.totalFisico}" style="font-size:1.3rem;font-weight:700;">
          <span class="field-hint">Solo el efectivo que hay físicamente en la caja registradora</span>
        </div>
        <div class="form-group" style="margin-bottom:15px;">
          <label for="cajaNotas">Notas (opcional)</label>
          <input id="cajaNotas" type="text" placeholder="Observaciones">
        </div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-danger" data-action="confirmar-cierre-caja" type="button">🔴 Confirmar Cierre</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    });
  },


  confirmarCierreCaja() {
    const montoFisico = Math.round(parseFloat(document.getElementById('cajaMontoFisico')?.value) || 0);
    const notas = document.getElementById('cajaNotas')?.value?.trim() || '';
    cerrarCaja(montoFisico, notas)
      .then(res => {
        this.cerrarModal();
        const r = res.resumen;
        alert(`✅ Caja cerrada exitosamente\n\n` +
          `💵 Efectivo Esperado: ${this.fmt(r.totalFisico)}\n` +
          `💰 Efectivo en Caja: ${this.fmt(r.montoFisico)}\n` +
          `📊 Diferencia Efectivo: ${this.fmt(r.diferencia)}\n` +
          `🏦 Total Bancario: ${this.fmt(r.totalBancario)}\n` +
          `─────────────────\n` +
          `📋 Total General: ${this.fmt(r.montoEsperado)}`);
        this.cargarCaja();
      })
      .catch(err => { this.showMessage('cajaMsg', 'Error: ' + err.message, 'error'); });
  },


  cargarHistorialCaja() {
    obtenerHistorialCaja().then(rows => {
      const el = document.getElementById('cajaHistorial');
      if (!el) return;
      if (!rows || !rows.length) { el.innerHTML = '<div class="message info">No hay cierres registrados</div>'; return; }
      el.innerHTML = `<div class="table-container"><table class="tabla-responsive"><thead><tr><th>Apertura</th><th>Cierre</th><th>Inicial</th><th>Esperado</th><th>Físico</th><th>Bancario</th><th>Diferencia</th><th>Notas</th></tr></thead>
        <tbody>${rows.map(r => {
          const dif = parseFloat(r.diferencia || 0);
          const difBadge = `<span class="badge ${dif === 0 ? 'badge-cerrado' : (dif > 0 ? 'badge-ingreso' : 'badge-cancelado')}">${this.fmt(dif)}</span>`;
          return `<tr>
          <td data-label="Apertura">${r.fechaHoraApertura || this.fmtFechaHora(r.fechaApertura)}</td>
          <td data-label="Cierre">${r.fechaHoraCierre || this.fmtFechaHora(r.fechaCierre)}</td>
          <td data-label="Inicial">${this.fmt(r.montoInicial)}</td>
          <td data-label="Esperado">${this.fmt(r.montoEsperado)}</td>
          <td data-label="Físico">${this.fmt(r.montoFisico)}</td>
          <td data-label="Bancario">🏦 ${this.fmt(r.totalBancario ?? (parseFloat(r.montoEsperado || 0) - parseFloat(r.montoFisico || 0) + parseFloat(r.diferencia || 0)))}</td>
          <td data-label="Diferencia">${difBadge}</td>
          <td data-label="Notas" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${this.escapeHtml(r.notas || '')}">${this.escapeHtml(r.notas || '—')}</td>
        </tr>`; }).join('')}</tbody></table></div>`;
    }).catch(() => {});
  }
});
