// Copito POS — Pure view functions for cash register.
// Each function takes data and returns an HTML string. No DOM manipulation.
const CajaView = {

  cerrada(aperturaHtml, historialHtml) {
    return `<div class="card caja-estado-card caja-cerrada"><div class="card-body">
      <div class="caja-estado-row"><span class="caja-estado-dot"></span>
        <div><h3 class="caja-estado-titulo">Caja cerrada</h3><p class="caja-estado-sub">No hay caja abierta actualmente</p></div>
        <span class="badge badge-disponible">Disponible</span></div></div></div>
      ${aperturaHtml}
      <div class="card caja-historial-card"><div class="card-header"><h2>Historial de Cierres</h2></div><div class="card-body">${historialHtml}</div></div>`;
  },

  aperturaForm(msgHtml) {
    return `<div class="card caja-apertura-card"><div class="card-header"><h2>Apertura de Caja</h2></div>
      <div class="card-body"><form id="abrirCajaForm" class="form-grid"><div class="form-group">
        <label for="cajaMontoInicial">Monto Inicial *</label>
        <input id="cajaMontoInicial" type="number" min="0" step="100" placeholder="Ej: 200000" required></div></form>
      <div class="actions"><button class="btn btn-success" data-action="abrir-caja" type="button">Abrir Caja</button></div>
      ${msgHtml}</div></div>`;
  },

  abierta(caja, resumen, propinas, options = {}) {
    const r = resumen;
    const rP = propinas;
    const mI = r.montoInicial || 0;

    const estadoHtml = `<div class="card caja-estado-card"><div class="card-body">
      <div class="caja-estado-row"><span class="caja-estado-dot"></span>
        <div><h3 class="caja-estado-titulo">Caja Abierta — #${App.escapeHtml(r.id)}</h3>
          <p class="caja-estado-sub">Apertura: ${App.fmtFechaHora(r.fechaHoraApertura)} | Hora: ${r.horaApertura} | Inicial: ${App.fmt(mI)}</p></div>
        <span class="badge badge-disponible">Abierta</span></div></div></div>`;

    const kpiHtml = `<div class="kpi-grid">
      <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-info"><div class="stat-label">Ventas</div><div class="stat-value stat-primary">${App.fmt(r.totalVentas)}</div></div></div>
      <div class="stat-card"><div class="stat-icon">📥</div><div class="stat-info"><div class="stat-label">Pagos recibidos</div><div class="stat-value stat-success">${App.fmt(r.totalIngresos)}</div></div></div>
      <div class="stat-card"><div class="stat-icon">🔄</div><div class="stat-info"><div class="stat-label">Movimientos</div><div class="stat-value stat-warning">${App.fmt(r.totalEsperado)}</div></div></div>
      <div class="stat-card"><div class="stat-icon">💵</div><div class="stat-info"><div class="stat-label">Saldo disponible</div><div class="stat-value stat-danger">${App.fmt(r.totalFisico)}</div></div></div>
      <div class="stat-card"><div class="stat-icon">💝</div><div class="stat-info"><div class="stat-label">Propinas del día</div><div class="stat-value">${App.fmt(rP.totalPropinas)}</div></div></div>
    </div>`;

    const splitHtml = `<div class="caja-split">
      <div class="card caja-split-card"><div class="card-header"><h3>💵 FÍSICO</h3></div>
        <div class="card-body"><div class="caja-split-body">
          <div class="caja-split-row"><span>Ventas efectivo</span><strong class="text-success">${App.fmt(r.efectivoVentas)}</strong></div>
          <div class="caja-split-row"><span>Ingresos</span><strong class="text-success">${App.fmt(r.efectivoIngresos)}</strong></div>
          <div class="caja-split-row"><span>Egresos</span><strong class="text-danger">${App.fmt(r.efectivoEgresos)}</strong></div>
          <div class="caja-split-row caja-split-total"><span><strong>Total Físico</strong></span><strong>${App.fmt(r.totalFisico)}</strong></div></div></div></div>
      <div class="card caja-split-card"><div class="card-header"><h3>🏦 BANCARIO</h3></div>
        <div class="card-body"><div class="caja-split-body">
          <div class="caja-split-row"><span>Ventas bancarias</span><strong class="text-success">${App.fmt(r.bancarioVentas)}</strong></div>
          <div class="caja-split-row"><span>Ingresos</span><strong class="text-success">${App.fmt(r.bancarioIngresos)}</strong></div>
          <div class="caja-split-row"><span>Egresos</span><strong class="text-danger">${App.fmt(r.bancarioEgresos)}</strong></div>
          <div class="caja-split-row caja-split-total"><span><strong>Total Bancario</strong></span><strong>${App.fmt(r.totalBancario)}</strong></div></div></div></div>
    </div>`;

    let propinasTabla = '';
    if (rP.propinas && rP.propinas.length > 0) {
      propinasTabla = `<table class="tabla-responsive"><thead><tr>
        <th data-label="Fecha">Fecha</th><th data-label="Hora">Hora</th><th data-label="Mesa/Pedido">Mesa/Pedido</th>
        <th data-label="Colaborador">Colaborador</th><th data-label="Método">Método</th><th data-label="Monto">Monto</th></tr></thead>
        <tbody>${rP.propinas.map(p => `<tr>
          <td data-label="Fecha">${App.escapeHtml(p.fechaCorta)}</td><td data-label="Hora">${App.escapeHtml(p.hora)}</td>
          <td data-label="Mesa/Pedido">${App.escapeHtml(p.pedidoId || p.lugar || '—')}</td>
          <td data-label="Colaborador">${App.escapeHtml(p.usuario)}</td>
          <td data-label="Método"><span class="badge badge-${p.metodoPago === 'Efectivo' ? 'fisico' : 'bancario'}">${App.escapeHtml(p.metodoPago)}</span></td>
          <td data-label="Monto"><strong>${App.fmt(p.monto)}</strong></td></tr>`).join('')}</tbody></table>`;
    } else {
      propinasTabla = '<div style="padding:15px;text-align:center;color:var(--text-muted);font-style:italic;">No hay propinas registradas hoy</div>';
    }

    const propinasCardHtml = `<div class="card caja-propinas-card"><div class="card-header">
        <h3>💝 Propinas</h3>
        <button class="btn btn-sm btn-primary" data-action="propina-general" type="button">Registrar Propina General</button></div>
      <div class="card-body"><div class="caja-propinas-summary">
        <div class="caja-propinas-row"><span>💵 Efectivo</span><strong>${App.fmt(rP.efectivoPropinas)}</strong></div>
        <div class="caja-propinas-row"><span>🏦 Transferencia</span><strong>${App.fmt(rP.bancarioPropinas)}</strong></div>
        <div class="caja-propinas-row caja-propinas-total"><span><strong>Total Propinas</strong></span><strong>${App.fmt(rP.totalPropinas)}</strong></div></div>
      <div class="table-container">${propinasTabla}</div></div></div>`;

    const movFormHtml = `<div class="card caja-mov-card"><div class="card-header"><h2>Movimiento Manual</h2></div>
      <div class="card-body"><form id="movCajaForm" class="form-grid">
        <div class="form-group"><label for="cajaMovTipo">Tipo *</label>
          <select id="cajaMovTipo" required><option value="INGRESO">Ingreso</option><option value="EGRESO">Egreso</option></select></div>
        <div class="form-group"><label for="cajaMovMetodo">Método de pago *</label>
          <select id="cajaMovMetodo" required><option value="Efectivo">Efectivo</option><option value="Transferencia">Transferencia</option></select></div>
        <div class="form-group"><label for="cajaMovMonto">Monto *</label><input id="cajaMovMonto" type="number" min="1" step="1" required></div>
        <div class="form-group"><label for="cajaMovDesc">Descripción *</label><input id="cajaMovDesc" type="text" required></div>
      </form>
      <div class="actions"><button class="btn btn-success" data-action="registrar-mov-caja" type="button">Registrar</button></div>
      <div id="cajaMovMsg" aria-live="polite"></div>
      ${options.movMsg || ''}</div></div>`;

    let movimientosHtml = '';
    if (r.movimientos && r.movimientos.length > 0) {
      movimientosHtml = `<div class="card caja-table-card"><div class="card-header"><h2>Movimientos del Día</h2></div>
        <div class="card-body"><div class="table-container"><table class="tabla-responsive"><thead><tr>
          <th data-label="Fecha">Fecha</th><th data-label="Hora">Hora</th><th data-label="Tipo">Tipo</th>
          <th data-label="M. Pago">M. Pago</th><th data-label="Medio">Medio</th><th data-label="Descripción">Descripción</th><th data-label="Monto">Monto</th></tr></thead>
          <tbody>${r.movimientos.map(m => {
            const esIngreso = m.tipo === 'INGRESO' || (m.tipoPago === 'venta' && m.metodoPago === 'Efectivo');
            const medioBadge = m.tipoPago === 'FISICO' ? 'fisico' : (m.tipoPago === 'BANCARIO' ? 'bancario' : (m.tipoPago === 'venta' ? 'venta' : 'ok'));
            return `<tr>
              <td data-label="Fecha">${App.escapeHtml(m.fechaCorta)}</td><td data-label="Hora">${App.escapeHtml(m.hora)}</td>
              <td data-label="Tipo"><span class="badge badge-${esIngreso ? 'ingreso' : 'egreso'}">${App.escapeHtml(m.tipo)}</span></td>
              <td data-label="M. Pago">${App.escapeHtml(m.metodoPago)}</td>
              <td data-label="Medio"><span class="badge badge-${medioBadge}">${App.escapeHtml(m.tipoPago)}</span></td>
              <td data-label="Descripción">${App.escapeHtml(m.descripcion)}</td>
              <td data-label="Monto"><strong class="${esIngreso ? 'text-success' : 'text-danger'}">${esIngreso ? '+' : ''}${App.fmt(m.monto)}</strong></td></tr>`;
          }).join('')}</tbody></table></div></div></div>`;
    }

    const cerrarHtml = `<div class="actions caja-close-actions"><button class="btn btn-danger" data-action="cerrar-caja-modal" type="button">Cerrar Caja</button></div>`;

    return `<div id="cajaMsg" aria-live="polite"></div>` + estadoHtml + kpiHtml + splitHtml + propinasCardHtml + movFormHtml + movimientosHtml + cerrarHtml;
  },

  cerrarModal(resumen) {
    const r = resumen;
    const mI = r.montoInicial || 0;
    return `<div style="background:white;border-radius:12px;padding:25px;max-width:480px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:15px;">🔒 Cierre de Caja</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:20px;">Apertura: ${App.fmtFechaHora(r.fechaHoraApertura)} | Hora: ${r.horaApertura} | Inicial: ${App.fmt(mI)}</p>
      <div style="background:var(--success-bg);padding:12px;border-radius:8px;margin-bottom:15px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Monto Inicial:</span><strong>${App.fmt(mI)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Ventas Efectivo:</span><strong>${App.fmt(r.efectivoVentas)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Ingresos Físico:</span><strong>${App.fmt(r.efectivoIngresos)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Egresos Físico:</span><strong>${App.fmt(r.efectivoEgresos)}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;border-top:2px solid var(--success-text);padding-top:8px;margin-top:8px;"><span><strong>Efectivo Esperado:</strong></span><strong>${App.fmt(r.totalFisico)}</strong></div></div>
      <div style="background:var(--info-bg);padding:12px;border-radius:8px;margin-bottom:15px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Ventas Bancarias:</span><strong>${App.fmt(r.bancarioVentas)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Ingresos Bancarios:</span><strong>${App.fmt(r.bancarioIngresos)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Egresos Bancarios:</span><strong>${App.fmt(r.bancarioEgresos)}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;border-top:2px solid #0288d1;padding-top:8px;margin-top:8px;"><span><strong>Total Bancario:</strong></span><strong>${App.fmt(r.totalBancario)}</strong></div></div>
      <div style="background:var(--primary-bg-light);padding:12px;border-radius:8px;margin-bottom:15px;">
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;"><span><strong>Total General Esperado:</strong></span><strong>${App.fmt(r.totalEsperado)}</strong></div></div>
      <div id="cajaDifBox" class="caja-dif-ok">
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;"><span><strong>Diferencia:</strong></span><strong id="cajaDifValor">${App.fmt(0)}</strong></div>
        <small id="cajaDifMsg">Cuadre exacto ✔</small></div>
      <div class="form-group" style="margin-bottom:15px;">
        <label for="cajaMontoFisico" style="font-weight:600;">Conteo Físico del Efectivo *</label>
        <input id="cajaMontoFisico" type="number" min="0" step="1" value="${r.totalFisico || 0}" style="font-size:1.1rem;font-weight:600;" required>
        <small style="color:var(--text-muted);">Solo el efectivo que hay físicamente en la caja registradora</small></div>
      <div class="form-group" style="margin-bottom:20px;"><label for="cajaNotas">Observaciones</label>
        <input id="cajaNotas" type="text" placeholder="Opcional"></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-danger" data-action="confirmar-cierre-caja" type="button">🔒 Confirmar Cierre</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button></div>
    </div>`;
  },

  historial(rows) {
    if (!rows || rows.length === 0) return '<div class="message info">No hay cierres registrados</div>';
    return `<div class="table-container"><table class="tabla-responsive">
      <thead><tr><th>Apertura</th><th>Cierre</th><th>Inicial</th><th>Esperado</th><th>Físico</th><th>Bancario</th><th>Diferencia</th><th>Notas</th></tr></thead>
      <tbody>${rows.map(r => {
        const dif = parseFloat(r.diferencia) || 0;
        const badgeClass = dif === 0 ? 'badge-cerrado' : dif > 0 ? 'badge-ingreso' : 'badge-cancelado';
        const totalBancario = r.totalBancario != null ? r.totalBancario : (r.montoEsperado - r.montoFisico + dif);
        return `<tr>
          <td data-label="Apertura">${App.fmtFechaHora(r.fechaHoraApertura)}</td>
          <td data-label="Cierre">${App.fmtFechaHora(r.fechaHoraCierre)}</td>
          <td data-label="Inicial">${App.fmt(r.montoInicial)}</td>
          <td data-label="Esperado">${App.fmt(r.montoEsperado)}</td>
          <td data-label="Físico">${App.fmt(r.montoFisico)}</td>
          <td data-label="Bancario">${App.fmt(totalBancario)}</td>
          <td data-label="Diferencia"><span class="badge ${badgeClass}">${App.fmt(dif)}</span></td>
          <td data-label="Notas"><span title="${App.escapeHtml(r.notas || '')}">${App.escapeHtml((r.notas || '').substring(0, 30))}${(r.notas || '').length > 30 ? '...' : ''}</span></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
};
