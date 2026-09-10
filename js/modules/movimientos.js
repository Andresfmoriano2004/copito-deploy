// Copito POS — Movimientos de stock.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== MOVIMIENTOS ==================
  cargarMovimientos() {
    const container = document.querySelector('#movimientos .content-body');
    if (!container) return;
    this.loadingSpinner(container, true);
    Promise.all([obtenerMovimientos(), obtenerProductos()]).then(([movimientos, productos]) => {
      this.state.movimientosData = movimientos;
      container.innerHTML = `
        <div class="card"><div class="card-header">Nuevo Movimiento</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group"><label>Producto</label><select id="movProducto"><option value="">Seleccione...</option>
              ${productos.map(p => `<option value="${this.escapeHtml(p.codigo)}">${this.escapeHtml(p.codigo)} — ${this.escapeHtml(p.nombre)}</option>`).join('')}
            </select></div>
            <div class="form-group"><label>Tipo</label><select id="movTipo">
              <option value="INGRESO">INGRESO</option>
              <option value="SALIDA">SALIDA</option>
            </select></div>
            <div class="form-group"><label>Cantidad</label><input id="movCantidad" type="number" min="0.01" step="0.01"></div>
            <div class="form-group"><label>Nota</label><input id="movNota" type="text" placeholder="Motivo"></div>
          </div>
          <div class="actions"><button class="btn btn-success" data-action="save-movement" type="button">Registrar</button></div>
          <div id="movMsg" aria-live="polite"></div>
        </div></div>
        <div class="card"><div class="card-header">📜 Historial de Movimientos</div><div class="card-body">
          <div class="filtros-bar">
            <div class="form-group"><label for="movFiltroDesde">Desde</label><input id="movFiltroDesde" type="date"></div>
            <div class="form-group"><label for="movFiltroHasta">Hasta</label><input id="movFiltroHasta" type="date"></div>
            <div class="form-group"><label for="movFiltroTipo">Tipo</label><select id="movFiltroTipo">
              <option value="">Todos</option><option value="INGRESO">Ingreso</option><option value="SALIDA">Salida</option>
            </select></div>
            <div class="form-group filtros-buscar"><label for="movFiltroTexto">Producto / nota</label><input id="movFiltroTexto" type="text" placeholder="Buscar..." autocomplete="off"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" role="group" aria-label="Filtrar por tipo de movimiento">
            <button class="btn btn-sm btn-secondary" data-action="filtro-mov-tipo" data-tipo="" type="button">📋 Todos</button>
            <button class="btn btn-sm btn-secondary" data-action="filtro-mov-tipo" data-tipo="INGRESO" type="button">📥 Ingresos</button>
            <button class="btn btn-sm btn-secondary" data-action="filtro-mov-tipo" data-tipo="SALIDA" type="button">📤 Salidas</button>
          </div>
          <div class="table-container"><div id="movHistorialTable" aria-live="polite"></div></div>
        </div></div>`;
      this.renderMovimientosHist();
      this.pintarChipsMovTipo();
      ['movFiltroDesde', 'movFiltroHasta', 'movFiltroTipo', 'movFiltroTexto'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => { this.state.movPage = 1; this.renderMovimientosHist(); this.pintarChipsMovTipo(); });
      });
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },


  renderMovimientosHist() {
    const el = document.getElementById('movHistorialTable');
    if (!el) return;
    const desde = document.getElementById('movFiltroDesde')?.value || '';
    const hasta = document.getElementById('movFiltroHasta')?.value || '';
    const tipo = document.getElementById('movFiltroTipo')?.value || '';
    const texto = (document.getElementById('movFiltroTexto')?.value || '').toLowerCase().trim();
    let lista = this.state.movimientosData || [];
    if (tipo) lista = lista.filter(m => m.tipo === tipo);
    if (texto) lista = lista.filter(m => ((m.producto || '') + ' ' + (m.codigo || '') + ' ' + (m.nota || '')).toLowerCase().includes(texto));
    if (desde || hasta) {
      lista = lista.filter(m => {
        const iso = m.fechaISO || '';
        const dia = iso ? iso.slice(0, 10) : '';
        if (!dia) return true;
        if (desde && dia < desde) return false;
        if (hasta && dia > hasta) return false;
        return true;
      });
    }
    if (!lista.length) { el.innerHTML = '<div class="message info">Sin movimientos para los filtros seleccionados</div>'; return; }
    // Fase 2: paginación en cliente (50/página) para no inyectar miles de filas al DOM.
    const pg = this.paginarLista(lista, this.state.movPage || 1, 50);
    this.state.movPage = pg.page;
    el.innerHTML = `<div class="message success">${pg.total} movimiento(s)</div>
      <table class="tabla-responsive"><thead><tr><th>Fecha</th><th>Hora</th><th>Producto</th><th>Tipo</th><th style="text-align:right;">Cantidad</th><th>Nota</th></tr></thead>
      <tbody>${pg.data.map(m => `<tr>
        <td data-label="Fecha">${m.fecha || this.fmtFecha(m.fechaISO)}</td>
        <td data-label="Hora">${m.hora || this.fmtHora(m.fechaISO)}</td>
        <td data-label="Producto">${this.escapeHtml(m.producto || m.codigo)}</td>
        <td data-label="Tipo">${this.badgeEstado(m.tipo)}</td>
        <td data-label="Cantidad" style="text-align:right;font-weight:600;">${m.cantidad}</td>
        <td data-label="Nota">${this.escapeHtml(m.nota)}</td>
      </tr>`).join('')}</tbody></table>
      <div id="movPager"></div>`;
    this.renderPager(document.getElementById('movPager'), pg, (np) => { this.state.movPage = np; this.renderMovimientosHist(); });
  },


  // Chips rápidos Todos/Ingresos/Salidas (sincronizados con el select existente).
  filtrarMovTipo(tipo) {
    const sel = document.getElementById('movFiltroTipo');
    if (sel) sel.value = tipo || '';
    this.state.movPage = 1;
    this.renderMovimientosHist();
    this.pintarChipsMovTipo();
  },

  pintarChipsMovTipo() {
    const actual = document.getElementById('movFiltroTipo')?.value || '';
    document.querySelectorAll('[data-action="filtro-mov-tipo"]').forEach(b => {
      const on = (b.dataset.tipo || '') === actual;
      b.classList.toggle('btn-primary', on);
      b.classList.toggle('btn-secondary', !on);
    });
  },


  guardarMovimiento() {
    const codigo = document.getElementById('movProducto')?.value;
    const tipo = document.getElementById('movTipo')?.value;
    const cantidad = parseFloat(document.getElementById('movCantidad')?.value);
    const nota = document.getElementById('movNota')?.value?.trim() || '';
    if (!codigo || !tipo || !cantidad) return this.showMessage('movMsg', 'Complete producto, tipo y cantidad', 'error');
    registrarMovimiento({ codigo, tipo, cantidad, nota })
      .then(res => { this.showMessage('movMsg', res.mensaje, 'success'); this.cargarMovimientos(); })
      .catch(err => { this.showMessage('movMsg', 'Error: ' + err.message, 'error'); });
  }
});
