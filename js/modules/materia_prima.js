// ─── Materia Prima module ──────────────────────────────
Object.assign(App, {
  materiaPrimaData: [],

  async cargarMateriaPrima() {
    const el = document.getElementById('materiaPrimaContent');
    if (!el) return;
    el.innerHTML = '<div class="loading"><span class="loading-spinner"></span> Cargando...</div>';
    try {
      this.materiaPrimaData = await apiGet('/materia-prima');
      this._renderMateriaPrima();
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  },

  _renderMateriaPrima() {
    const el = document.getElementById('materiaPrimaContent');
    if (!el) return;
    const items = this.materiaPrimaData;
    let html = `
      <div class="card">
        <div class="card-header">Materia Prima</div>
        <div class="card-body">
          <div class="actions" style="margin-bottom:15px;">
            <button class="btn btn-success" data-action="mp-nuevo" type="button">+ Nueva Materia Prima</button>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Unidad</th>
                  <th>Stock Actual</th>
                  <th>Stock Mín.</th>
                  <th>Costo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>`;

    if (!items.length) {
      html += `<tr><td colspan="7" class="empty-state">No hay materia prima registrada</td></tr>`;
    }

    items.forEach(mp => {
      const stockBajo = mp.stockActual <= mp.stockMinimo && mp.stockMinimo > 0;
      html += `
        <tr class="${stockBajo ? 'row-warning' : ''}">
          <td><strong>${mp.codigo}</strong></td>
          <td>${mp.nombre}</td>
          <td>${mp.unidad}</td>
          <td class="${stockBajo ? 'text-danger' : ''}">${mp.stockActual.toLocaleString('es-CO')}</td>
          <td>${mp.stockMinimo.toLocaleString('es-CO')}</td>
          <td>$${mp.costo.toLocaleString('es-CO')}</td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-primary" data-action="mp-movimiento" data-codigo="${mp.codigo}" data-tipo="INGRESO" type="button">+ Ingreso</button>
              <button class="btn btn-sm btn-warning" data-action="mp-movimiento" data-codigo="${mp.codigo}" data-tipo="SALIDA" type="button">- Salida</button>
              <button class="btn btn-sm btn-info" data-action="mp-historial" data-codigo="${mp.codigo}" type="button">Historial</button>
              <button class="btn btn-sm btn-secondary" data-action="mp-editar" data-codigo="${mp.codigo}" type="button">Editar</button>
              <button class="btn btn-sm btn-danger" data-action="mp-eliminar" data-codigo="${mp.codigo}" data-nombre="${mp.nombre}" type="button">Eliminar</button>
            </div>
          </td>
        </tr>`;
    });

    html += `</tbody></table></div></div></div>`;
    el.innerHTML = html;
  },

  mpMostrarFormNuevo() {
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">Nueva Materia Prima</h3>
      <div class="form-group">
        <label>Código *</label>
        <input id="mpCodigo" type="text" placeholder="Ej: CAFE-001" maxlength="20">
      </div>
      <div class="form-group">
        <label>Nombre *</label>
        <input id="mpNombre" type="text" placeholder="Ej: Café en Grano" maxlength="200">
      </div>
      <div class="form-group">
        <label>Unidad *</label>
        <input id="mpUnidad" type="text" placeholder="Ej: Gramos" list="unidadesMpList" maxlength="50">
        <datalist id="unidadesMpList"></datalist>
      </div>
      <div class="form-group">
        <label>Stock Mínimo</label>
        <input id="mpStockMin" type="number" min="0" step="0.01" value="0">
      </div>
      <div class="form-group">
        <label>Costo por unidad</label>
        <input id="mpCosto" type="number" min="0" step="1" value="0">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="mp-guardar" type="button">Guardar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
    obtenerUnidades().then(unidades => {
      const dl = document.getElementById('unidadesMpList');
      if (dl) dl.innerHTML = unidades.map(u => `<option value="${u}">`).join('');
    }).catch(() => {});
    document.getElementById('mpCodigo')?.focus();
  },

  async mpGuardar() {
    const codigo = document.getElementById('mpCodigo')?.value?.trim();
    const nombre = document.getElementById('mpNombre')?.value?.trim();
    const unidad = document.getElementById('mpUnidad')?.value?.trim();
    const stockMinimo = parseFloat(document.getElementById('mpStockMin')?.value) || 0;
    const costo = parseFloat(document.getElementById('mpCosto')?.value) || 0;
    if (!codigo || !nombre || !unidad) {
      this.showMessage('modalMsg', 'Código, nombre y unidad son requeridos', 'error');
      return;
    }
    try {
      await apiPost('/materia-prima', { codigo, nombre, unidad, stockMinimo, costo });
      this.cerrarModal();
      this.cargarMateriaPrima();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  mpMostrarFormEditar(codigo) {
    const mp = this.materiaPrimaData.find(m => m.codigo === codigo);
    if (!mp) return;
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">Editar: ${mp.nombre}</h3>
      <div class="form-group">
        <label>Nombre</label>
        <input id="mpEditNombre" type="text" value="${mp.nombre}" maxlength="200">
      </div>
      <div class="form-group">
        <label>Unidad</label>
        <input id="mpEditUnidad" type="text" value="${mp.unidad}" maxlength="50">
      </div>
      <div class="form-group">
        <label>Stock Mínimo</label>
        <input id="mpEditStockMin" type="number" min="0" step="0.01" value="${mp.stockMinimo}">
      </div>
      <div class="form-group">
        <label>Costo por unidad</label>
        <input id="mpEditCosto" type="number" min="0" step="1" value="${mp.costo}">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="mp-actualizar" data-codigo="${codigo}" type="button">Actualizar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
  },

  async mpActualizar(codigo) {
    const nombre = document.getElementById('mpEditNombre')?.value?.trim();
    const unidad = document.getElementById('mpEditUnidad')?.value?.trim();
    const stockMinimo = parseFloat(document.getElementById('mpEditStockMin')?.value) || 0;
    const costo = parseFloat(document.getElementById('mpEditCosto')?.value) || 0;
    if (!nombre || !unidad) {
      this.showMessage('modalMsg', 'Nombre y unidad son requeridos', 'error');
      return;
    }
    try {
      await apiPut(`/materia-prima/${encodeURIComponent(codigo)}`, { nombre, unidad, stockMinimo, costo });
      this.cerrarModal();
      this.cargarMateriaPrima();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  mpMostrarMovimiento(codigo, tipo) {
    const mp = this.materiaPrimaData.find(m => m.codigo === codigo);
    const titulo = tipo === 'INGRESO' ? 'Ingreso de Stock' : 'Salida de Stock';
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">${titulo}: ${mp ? mp.nombre : codigo}</h3>
      <div class="form-group">
        <label>Cantidad (${mp ? mp.unidad : ''}) *</label>
        <input id="mpMovCantidad" type="number" min="0.01" step="0.01" placeholder="Cantidad" autofocus>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <input id="mpMovNotas" type="text" placeholder="Descripción (opcional)" maxlength="500">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="mp-guardar-mov" data-codigo="${codigo}" data-tipo="${tipo}" type="button">Registrar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
    document.getElementById('mpMovCantidad')?.focus();
  },

  async mpGuardarMovimiento(codigo, tipo) {
    const cantidad = parseFloat(document.getElementById('mpMovCantidad')?.value);
    const notas = document.getElementById('mpMovNotas')?.value?.trim() || null;
    if (!cantidad || cantidad <= 0) {
      this.showMessage('modalMsg', 'Ingrese una cantidad válida', 'error');
      return;
    }
    try {
      await apiPost('/materia-prima/movimiento', { codigo, tipo, cantidad, notas });
      this.cerrarModal();
      this.cargarMateriaPrima();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  async mpMostrarHistorial(codigo) {
    const mp = this.materiaPrimaData.find(m => m.codigo === codigo);
    try {
      const rows = await apiGet(`/materia-prima/historial/${encodeURIComponent(codigo)}`);
      let html = `<h3 style="margin-bottom:15px;">Historial: ${mp ? mp.nombre : codigo}</h3>`;
      if (!rows.length) {
        html += `<p class="empty-state">Sin movimientos registrados</p>`;
      } else {
        html += `<div class="table-container"><table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Notas</th><th>Usuario</th></tr></thead><tbody>`;
        rows.forEach(r => {
          const fecha = r.fecha ? new Date(r.fecha + 'Z').toLocaleString('es-CO') : '';
          html += `<tr>
            <td>${fecha}</td>
            <td><span class="badge ${r.tipo === 'INGRESO' ? 'badge-abierto' : 'badge-cerrado'}">${r.tipo}</span></td>
            <td>${r.cantidad}</td>
            <td>${r.notas || '-'}</td>
            <td>${r.usuario_nombre || '-'}</td>
          </tr>`;
        });
        html += `</tbody></table></div>`;
      }
      html += `<div class="actions" style="margin-top:15px;"><button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cerrar</button></div>`;
      this.mostrarModal(html);
    } catch (e) {
      this.showMessage('materiaPrimaMsg', 'Error al cargar historial: ' + e.message, 'error');
    }
  },

  async mpEliminar(codigo, nombre) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await apiDelete(`/materia-prima/${encodeURIComponent(codigo)}`);
      this.cargarMateriaPrima();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }
});
