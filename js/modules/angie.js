// ─── Gasto Personal — Consumo Interno module ────────────
Object.assign(App, {
  gastoData: [],
  gastoResumen: [],

  async cargarAngie() {
    const el = document.getElementById('angieContent');
    if (!el) return;
    el.innerHTML = '<div class="loading"><span class="loading-spinner"></span> Cargando...</div>';
    try {
      const [consumos, resumen] = await Promise.all([
        apiGet('/consumos-internos'),
        apiGet(`/consumos-internos/resumen?desde=${this._angieMesActual()}&hasta=${this._angieHoy()}`)
      ]);
      this.gastoData = consumos;
      this.gastoResumen = resumen;
      this._renderGastoPersonal();
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  },

  _angieMesActual() {
    return new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01';
  },
  _angieHoy() {
    return new Date().toISOString().slice(0, 10);
  },

  _renderGastoPersonal() {
    const el = document.getElementById('angieContent');
    if (!el) return;
    const consumos = this.gastoData;
    const resumen = this.gastoResumen;

    let resumenHtml = '';
    if (resumen.length) {
      const totalGeneral = resumen.reduce((s, r) => s + parseFloat(r.total), 0);
      resumenHtml = `
        <div class="card">
          <div class="card-header">Resumen del Mes</div>
          <div class="card-body">
            <div class="stats-grid">
              ${resumen.map(r => `
                <div class="stat-card">
                  <div class="stat-label">${r.persona}</div>
                  <div class="stat-value">${this.fmt(r.total)}</div>
                  <div class="stat-detail">${r.items} producto(s)</div>
                </div>
              `).join('')}
              <div class="stat-card stat-card-primary">
                <div class="stat-label">Total General</div>
                <div class="stat-value">${this.fmt(totalGeneral)}</div>
              </div>
            </div>
          </div>
        </div>`;
    }

    let tableHtml = '';
    if (consumos.length) {
      tableHtml = `
        <div class="card">
          <div class="card-header">Detalle de Gastos</div>
          <div class="card-body">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr><th>Fecha</th><th>Persona</th><th>Producto</th><th>Cant.</th><th>P/U</th><th>Subtotal</th><th>Notas</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  ${consumos.map(c => `
                    <tr>
                      <td>${c.fechaHora || ''}</td>
                      <td><strong>${this.escapeHtml(c.persona)}</strong></td>
                      <td>${this.escapeHtml(c.productoNombre)}</td>
                      <td>${c.cantidad}</td>
                      <td>${this.fmt(c.precioUnitario)}</td>
                      <td><strong>${this.fmt(c.subtotal)}</strong></td>
                      <td>${c.notas || '-'}</td>
                      <td><button class="btn btn-sm btn-danger" data-action="angie-eliminar" data-id="${c.id}" type="button">Eliminar</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    } else {
      tableHtml = '<div class="empty-state">No hay gastos personales registrados este mes.</div>';
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-header">Registrar Gasto Personal</div>
        <div class="card-body">
          <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr auto;">
            <div class="form-group">
              <label>Persona *</label>
              <input id="angiePersona" type="text" placeholder="Nombre de la persona">
            </div>
            <div class="form-group">
              <label>Producto *</label>
              <input id="angieProducto" type="text" placeholder="Buscar producto..." list="angieProductosList" autocomplete="off">
              <datalist id="angieProductosList"></datalist>
            </div>
            <div class="form-group">
              <label>Cantidad *</label>
              <input id="angieCantidad" type="number" min="0.01" step="1" value="1">
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <button class="btn btn-success" data-action="angie-registrar" type="button">Registrar</button>
            </div>
          </div>
          <div class="form-group">
            <label>Notas (opcional)</label>
            <input id="angieNotas" type="text" placeholder="Descripción del consumo">
          </div>
          <div id="angieMsg2" aria-live="polite"></div>
        </div>
      </div>
      ${resumenHtml}
      ${tableHtml}
    `;

    // Load products for datalist
    apiGet('/productos').then(prods => {
      const dl = document.getElementById('angieProductosList');
      if (dl) dl.innerHTML = prods.map(p => `<option value="${p.nombre}">${p.codigo}</option>`).join('');
    }).catch(() => {});
  },

  async angieRegistrar() {
    const persona = document.getElementById('angiePersona')?.value?.trim();
    const prodInput = document.getElementById('angieProducto')?.value?.trim();
    const cantidad = parseFloat(document.getElementById('angieCantidad')?.value);
    const notas = document.getElementById('angieNotas')?.value?.trim() || null;

    if (!persona || !prodInput || !cantidad || cantidad <= 0) {
      this.showMessage('angieMsg2', 'Persona, producto y cantidad son requeridos', 'error');
      return;
    }

    // Find product code from datalist
    const options = document.querySelectorAll('#angieProductosList option');
    let codigo = null;
    options.forEach(opt => {
      if (opt.value === prodInput) codigo = opt.textContent;
    });
    if (!codigo) {
      // Try matching by name
      try {
        const prods = await apiGet('/productos');
        const found = prods.find(p => p.nombre.toLowerCase() === prodInput.toLowerCase());
        if (found) codigo = found.codigo;
      } catch(e) {}
    }
    if (!codigo) {
      this.showMessage('angieMsg2', 'Producto no encontrado. Seleccione de la lista.', 'error');
      return;
    }

    try {
      await apiPost('/consumos-internos', { persona, codigoProducto: codigo, cantidad, notas });
      this.showMessage('angieMsg2', 'Gasto registrado correctamente', 'success');
      this.cargarAngie();
    } catch (e) {
      this.showMessage('angieMsg2', 'Error: ' + e.message, 'error');
    }
  },

  async angieEliminar(id) {
    if (!confirm('¿Eliminar este gasto y reversar el stock?')) return;
    try {
      await apiDelete(`/consumos-internos/${id}`);
      this.cargarAngie();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }
});
