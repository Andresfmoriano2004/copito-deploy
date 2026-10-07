// ─── Recetas module ──────────────────────────────────────
Object.assign(App, {
  recetasData: [],
  recetasMP: [],
  recetasProductos: [],

  getRecetasAgrupadas() {
    const grouped = {};
    this.recetasData.forEach(receta => {
      if (!grouped[receta.codigoProducto]) {
        grouped[receta.codigoProducto] = {
          nombre: receta.productoNombre,
          items: []
        };
      }
      grouped[receta.codigoProducto].items.push(receta);
    });
    return grouped;
  },

  getRecetaStats(items) {
    const productosConReceta = new Set(items.map(item => item.codigoProducto)).size;
    const ingredientesUsados = new Set(items.map(item => item.codigoMateriaPrima)).size;
    const totalLineas = items.length;
    return { productosConReceta, ingredientesUsados, totalLineas };
  },

  async cargarRecetas() {
    const el = document.getElementById('recetasContent');
    if (!el) return;
    el.innerHTML = '<div class="loading"><span class="loading-spinner"></span> Cargando...</div>';
    try {
      const [recetas, mp, prods] = await Promise.all([
        apiGet('/recetas'),
        apiGet('/materia-prima'),
        apiGet('/productos')
      ]);
      this.recetasData = recetas;
      this.recetasMP = mp;
      this.recetasProductos = prods;
      this._renderRecetas();
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${App.escapeHtml(e.message)}</div>`;
    }
  },

  _renderRecetas() {
    const el = document.getElementById('recetasContent');
    if (!el) return;

    const grouped = this.getRecetasAgrupadas();
    const stats = this.getRecetaStats(this.recetasData);

    let html = `
      <div class="card">
        <div class="card-header">Recetas (Producto → Materia Prima)</div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${stats.productosConReceta}</div>
              <div class="stat-label">Productos con receta</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.ingredientesUsados}</div>
              <div class="stat-label">Ingredientes usados</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.totalLineas}</div>
              <div class="stat-label">Líneas de receta</div>
            </div>
          </div>

          <div class="actions" style="margin-bottom:15px;">
            <button class="btn btn-success" data-action="receta-nueva" type="button">+ Nueva Receta</button>
          </div>`;

    if (!this.recetasData.length) {
      html += `<p class="empty-state">No hay recetas creadas. Las recetas definen cuánta materia prima se consume por producto.</p>`;
    } else {
      html += `<div class="table-container"><table class="data-table">
        <thead><tr><th>Producto</th><th>Materia Prima</th><th>Cantidad</th><th>Notas</th><th>Acciones</th></tr></thead>
        <tbody>`;

      Object.entries(grouped).forEach(([codigo, grupo]) => {
        grupo.items.forEach((r, i) => {
          html += `<tr>
            ${i === 0 ? `<td rowspan="${grupo.items.length}" style="font-weight:600;">${this.escapeHtml(grupo.nombre)}</td>` : ''}
            <td>${this.escapeHtml(r.materiaPrimaNombre)} (${this.escapeHtml(r.materiaPrimaUnidad)})</td>
            <td><strong>${Number(r.cantidad || 0)}</strong></td>
            <td>${this.escapeHtml(r.notas || '-')}</td>
            <td>
              <button class="btn btn-sm btn-secondary" data-action="receta-editar" data-id="${r.id}" data-cantidad="${r.cantidad}" data-notas="${this.escapeHtml(r.notas || '')}" type="button">Editar</button>
              <button class="btn btn-sm btn-danger" data-action="receta-eliminar" data-id="${r.id}" type="button">Eliminar</button>
            </td>
          </tr>`;
        });
      });

      html += `</tbody></table></div>`;
    }

    html += `</div></div>`;
    el.innerHTML = html;
  },

  recetaMostrarFormNueva() {
    const prodsOpts = this.recetasProductos.map(p => `<option value="${this.escapeHtml(p.codigo)}">${this.escapeHtml(p.nombre)} (${this.escapeHtml(p.codigo)})</option>`).join('');
    const mpOpts = this.recetasMP.map(m => `<option value="${this.escapeHtml(m.codigo)}">${this.escapeHtml(m.nombre)} (${this.escapeHtml(m.unidad)})</option>`).join('');
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">Nueva Receta</h3>
      <div class="form-group">
        <label>Producto *</label>
        <select id="recetaProducto">${prodsOpts}</select>
      </div>
      <div class="form-group">
        <label>Materia Prima *</label>
        <select id="recetaMP">${mpOpts}</select>
      </div>
      <div class="form-group">
        <label>Cantidad por unidad *</label>
        <input id="recetaCantidad" type="number" min="0.001" step="0.001" placeholder="Ej: 20 (gramos por taza)" autofocus>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <input id="recetaNotas" type="text" placeholder="Instrucciones (opcional)" maxlength="500">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="receta-guardar" type="button">Guardar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
    document.getElementById('recetaCantidad')?.focus();
  },

  async recetaGuardar() {
    const codigoProducto = document.getElementById('recetaProducto')?.value;
    const codigoMateriaPrima = document.getElementById('recetaMP')?.value;
    const cantidad = parseFloat(document.getElementById('recetaCantidad')?.value);
    const notas = document.getElementById('recetaNotas')?.value?.trim() || null;
    if (!codigoProducto || !codigoMateriaPrima || !cantidad || cantidad <= 0) {
      this.showMessage('modalMsg', 'Producto, materia prima y cantidad son requeridos', 'error');
      return;
    }
    try {
      await apiPost('/recetas', { codigoProducto, codigoMateriaPrima, cantidad, notas });
      this.cerrarModal();
      this.cargarRecetas();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  recetaMostrarFormEditar(id, cantidad, notas) {
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">Editar Receta</h3>
      <div class="form-group">
        <label>Cantidad por unidad *</label>
        <input id="recetaEditCantidad" type="number" min="0.001" step="0.001" value="${cantidad}" autofocus>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <input id="recetaEditNotas" type="text" value="${this.escapeHtml(notas || '')}" maxlength="500">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="receta-actualizar" data-id="${id}" type="button">Actualizar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
    document.getElementById('recetaEditCantidad')?.focus();
  },

  async recetaActualizar(id) {
    const cantidad = parseFloat(document.getElementById('recetaEditCantidad')?.value);
    const notas = document.getElementById('recetaEditNotas')?.value?.trim() || null;
    if (!cantidad || cantidad <= 0) {
      this.showMessage('modalMsg', 'Ingrese una cantidad válida', 'error');
      return;
    }
    try {
      await apiPut(`/recetas/${id}`, { cantidad, notas });
      this.cerrarModal();
      this.cargarRecetas();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  async recetaEliminar(id) {
    if (!confirm('¿Eliminar esta receta?')) return;
    try {
      await apiDelete(`/recetas/${id}`);
      this.cargarRecetas();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }
});

if (typeof AppEventRouter !== 'undefined') {
  AppEventRouter.registerMany({
    'receta-nueva': () => App.recetaMostrarFormNueva(),
    'receta-guardar': () => App.recetaGuardar(),
    'receta-editar': ({ button }) => App.recetaMostrarFormEditar(button.dataset.id, parseFloat(button.dataset.cantidad), button.dataset.notas),
    'receta-actualizar': ({ button }) => App.recetaActualizar(button.dataset.id),
    'receta-eliminar': ({ button }) => App.recetaEliminar(button.dataset.id)
  });
}
