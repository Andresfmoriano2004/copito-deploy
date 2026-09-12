// Copito POS — Productos e inventario.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== PRODUCTOS ==================
  cargarProductos() {
    const container = document.querySelector('#productos .content-body');
    if (!container) return;
    this.loadingSpinner(container, true);
    this.state.prodPage = 1;
    this.state.prodQ = '';
    // Fase 2: primera página desde el servidor (50 por página).
    obtenerProductos({ page: 1, limit: 50 }).then(res => {
      const pg = normPagina(res, 50);
      this.state.prodPage = pg.page;
      const productos = pg.data;
      container.innerHTML = `
        <div class="card"><div class="card-header">Registrar Nuevo Producto</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group form-full"><label for="prodCodigo">Código</label><input id="prodCodigo" type="text" required placeholder="Ej: CAFE-001"></div>
            <div class="form-group form-full"><label for="prodNombre">Nombre</label><input id="prodNombre" type="text" required></div>
            <div class="form-group form-full" style="display:none;"><label for="prodUnidad">Unidad</label><select id="prodUnidad" required></select></div>
            <div class="form-group form-full"><label for="prodGrupo">Grupo</label><select id="prodGrupo" required></select></div>
          <div class="form-group form-half"><label for="prodPrecio">Precio Venta</label><input id="prodPrecio" type="number" min="0" step="1" value="0"></div>
          <div class="form-group form-half"><label for="prodCosto">Costo Unitario</label><input id="prodCosto" type="number" min="0" step="1" value="0">
            <span class="field-hint">Lo que le costó el producto</span></div>
          <div class="form-group form-half"><label for="prodStockInicial">Stock Inicial</label><input id="prodStockInicial" type="number" min="0" step="0.01" value="0">
            <span class="field-hint">Cantidad actual en inventario</span></div>
          <div class="form-group form-half"><label for="prodStockMin">Stock Mín (alerta)</label><input id="prodStockMin" type="number" min="0" step="0.01" value="0">
            <span class="field-hint">Alerta cuando el stock baje de este número</span></div>
          <div class="form-group form-full"><label for="prodImagen">Imagen del producto</label><input id="prodImagen" type="file" accept="image/jpeg,image/png,image/webp">
            <span class="field-hint">JPG, PNG o WEBP. Máximo 2 MB.</span></div>
          </div>
          <div class="actions"><button class="btn btn-success" data-action="save-product" type="button">Crear Producto</button></div>
          <div id="productMsg" aria-live="polite"></div>
        </div></div>
        <div class="card"><div class="card-header">Listado de Productos</div><div class="card-body">
          <div class="search-box">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <input type="text" id="productSearch" placeholder="Buscar por nombre, código o categoría..." autocomplete="off" aria-label="Buscar productos por nombre, código o categoría">
          </div>
          <div class="table-container">
            <table class="tabla-responsive tabla-productos"><thead><tr><th>Código</th><th>Producto</th><th>Und</th><th>Categoría</th><th>Stock</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody id="productTableBody">
              ${productos.map(p => this.filaProducto(p)).join('')}
            </tbody></table>
          </div>
          <div id="prodPager"></div>
        </div></div>`;
      this.renderPager(document.getElementById('prodPager'), pg, (np) => this.cargarPaginaProductos(np));

      // Load selects
      Promise.all([obtenerGrupos(), obtenerUnidades()]).then(([grupos, unidades]) => {
        const grupoSel = document.getElementById('prodGrupo');
        const unidSel = document.getElementById('prodUnidad');
        if (grupoSel) { grupoSel.innerHTML = grupos.map(g => `<option value="${g}">${g}</option>`).join('') + '<option value="">-- Nuevo --</option>'; }
        if (unidSel) {
          if (!unidades.includes('Unidad')) {
            unidades = ['Unidad', ...unidades];
            crearUnidad('Unidad').catch(() => {});
          }
          unidSel.innerHTML = unidades.map(u => `<option value="${u}">${u}</option>`).join('') + '<option value="">-- Nueva --</option>';
          unidSel.value = 'Unidad';
        }
      });

      // Búsqueda server-side con debounce (Fase 2: resetea a página 1).
      const searchInput = document.getElementById('productSearch');
      if (searchInput) {
        if (this.state.searchTimeout) clearTimeout(this.state.searchTimeout);
        searchInput.addEventListener('input', () => {
          clearTimeout(this.state.searchTimeout);
          this.state.searchTimeout = setTimeout(() => {
            const q = searchInput.value.trim();
            if (q.length >= 2 || !q) {
              // Fase 2: búsqueda en servidor paginada (vuelve a página 1).
              this.state.prodQ = q.length >= 2 ? q : '';
              this.cargarPaginaProductos(1);
            } else {
              const ql = q.toLowerCase();
              document.querySelectorAll('#productTableBody tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(ql) ? '' : 'none';
              });
            }
          }, 250);
        });
      }

      // Autocomplete for selects
      this._setupSelectAutocomplete('prodUnidad', unidades => crearUnidad(unidades));
      this._setupSelectAutocomplete('prodGrupo', nombre => crearGrupo(nombre));
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },


  // Fase 2: carga una página del listado (reusa filaProducto, mismo HTML).
  cargarPaginaProductos(page) {
    const tbody = document.getElementById('productTableBody');
    if (!tbody) return;
    const q = this.state.prodQ || '';
    obtenerProductos({ page: page || this.state.prodPage || 1, limit: 50, q }).then(res => {
      const pg = normPagina(res, 50);
      this.state.prodPage = pg.page;
      tbody.innerHTML = pg.data.map(p => this.filaProducto(p)).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Sin resultados</td></tr>';
      this.renderPager(document.getElementById('prodPager'), pg, (np) => this.cargarPaginaProductos(np));
    }).catch(err => this.showMessage('productMsg', 'Error: ' + err.message, 'error'));
  },

  // Fila del listado (única fuente; mismo HTML que antes en ambos renders).
  filaProducto(p) {
    return `<tr>
      <td data-label="Código"><strong>${this.escapeHtml(p.codigo)}</strong></td>
      <td data-label="Producto" class="prod-nombre-cell">${p.imagenUrl ? `<img src="${this.escapeHtml(imgUrl(p.imagenUrl))}" alt="" loading="lazy" onerror="this.remove()" class="prod-thumb">` : '<span class="prod-sin-imagen" aria-hidden="true">🖼️</span>'}<span>${this.escapeHtml(p.nombre)}</span></td>
      <td data-label="Unidad">${this.escapeHtml(p.unidad)}</td>
      <td data-label="Categoría">${this.escapeHtml(p.grupo)}</td>
      <td data-label="Stock" style="color:${p.stockActual < p.stockMinimo ? 'var(--danger)' : 'var(--success)'};font-weight:600;">${p.stockActual} <small style="color:var(--text-muted);font-weight:400;">(mín ${p.stockMinimo})</small></td>
      <td data-label="Precio">${this.fmt(p.precio)}</td>
      <td data-label="Estado">${p.stockActual <= 0 ? '<span class="badge badge-cancelado">Sin stock</span>' : (p.stockActual < p.stockMinimo ? '<span class="badge badge-bajo">⚠ Bajo</span>' : '<span class="badge badge-ok">✔ OK</span>')}</td>
      <td data-label="Acciones" class="prod-acciones"><button class="btn-icon" data-action="view-product" data-codigo="${this.escapeHtml(p.codigo)}" title="Ver detalle">👁️</button>
          <button class="btn-icon" data-action="edit-product" data-codigo="${this.escapeHtml(p.codigo)}" title="Editar">✏️</button>
          <button class="btn-icon" data-action="delete-product" data-codigo="${this.escapeHtml(p.codigo)}" data-nombre="${this.escapeHtml(p.nombre)}" title="Eliminar">🗑️</button></td>
    </tr>`;
  },


  _setupSelectAutocomplete(selectId, createFn) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.addEventListener('change', () => {
      if (select.value === '') {
        const label = selectId === 'prodUnidad' ? 'unidad' : 'grupo';
        select.selectedIndex = 0;
        this.mostrarModalPrompt({
          titulo: `Nueva ${label.charAt(0).toUpperCase() + label.slice(1)}`,
          placeholder: `Nombre de la ${label}`,
          onConfirm: async (val) => {
            try {
              await createFn(val);
              const opt = document.createElement('option');
              opt.value = val; opt.text = val;
              select.insertBefore(opt, select.lastElementChild);
              select.value = val;
              this.cerrarModal();
              this.showMessage('productMsg', `${label.charAt(0).toUpperCase() + label.slice(1)} "${val}" creada`, 'success');
            } catch (err) { this.showMessage('productMsg', 'Error: ' + err.message, 'error'); }
          }
        });
      }
    });
  },


  guardarProducto() {
    const codigo = document.getElementById('prodCodigo')?.value?.trim();
    const nombre = document.getElementById('prodNombre')?.value?.trim();
    let unidad = document.getElementById('prodUnidad')?.value;
    if (!unidad) unidad = 'Unidad';
    const grupo = document.getElementById('prodGrupo')?.value;
    const stockMinimo = parseFloat(document.getElementById('prodStockMin')?.value) || 0;
    const precio = Math.round(parseFloat(document.getElementById('prodPrecio')?.value) || 0);
    const costo = Math.round(parseFloat(document.getElementById('prodCosto')?.value) || 0);
    const stockInicial = parseFloat(document.getElementById('prodStockInicial')?.value) || 0;
    const imagen = document.getElementById('prodImagen')?.files?.[0];
    if (imagen && imagen.size > 2 * 1024 * 1024) {
      return this.showMessage('productMsg', 'La imagen no puede superar 2 MB', 'error');
    }
    if (!codigo || !nombre || !unidad || !grupo) {
      return this.showMessage('productMsg', 'Complete código, nombre, unidad y grupo', 'error');
    }
    registrarProducto({ codigo, nombre, unidad, grupo, stockMinimo, precio, costo, stockInicial })
      .then(async res => { if (imagen) await subirImagenProducto(codigo, imagen); this.showMessage('productMsg', res.mensaje, 'success'); this.cargarProductos(); })
      .catch(err => { this.showMessage('productMsg', 'Error: ' + err.message, 'error'); });
  },


  eliminarProducto(codigo, nombre) {
    if (!codigo) return;
    if (!confirm(`¿Eliminar el producto "${nombre || codigo}"?\n\nNo se podrá deshacer. Si tiene movimientos asociados, el servidor puede rechazar la eliminación.`)) return;
    eliminarProducto(codigo)
      .then(res => { this.showMessage('productMsg', res.mensaje || 'Producto eliminado', 'success'); this.cargarProductos(); })
      .catch(err => { this.showMessage('productMsg', 'Error: ' + err.message, 'error'); });
  },


  verDetalleProducto(codigo) {
    obtenerProducto(codigo).then(prod => {
      this.cerrarModal();
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:450px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow-y:auto;">
        <h3 style="color:var(--primary);margin-bottom:15px;">${this.escapeHtml(prod.nombre)}</h3>
        <div style="text-align:center;margin-bottom:15px;">${prod.imagenUrl ? `<img src="${this.escapeHtml(imgUrl(prod.imagenUrl))}" alt="Imagen de ${this.escapeHtml(prod.nombre)}" style="max-width:100%;max-height:220px;border-radius:10px;object-fit:cover;" onerror="this.remove()">` : '<div style="font-size:3rem;">🖼️</div><div style="color:var(--text-muted);font-size:0.85rem;">Sin imagen</div>'}</div>
        <table style="width:100%;"><tr><td style="padding:6px 0;color:var(--text-muted);">Código</td><td style="padding:6px 0;font-weight:600;">${this.escapeHtml(prod.codigo)}</td></tr>
        <tr><td style="padding:6px 0;color:var(--text-muted);">Unidad</td><td style="padding:6px 0;">${this.escapeHtml(prod.unidad)}</td></tr>
        <tr><td style="padding:6px 0;color:var(--text-muted);">Grupo</td><td style="padding:6px 0;">${this.escapeHtml(prod.grupo)}</td></tr>
        <tr><td style="padding:6px 0;color:var(--text-muted);">Stock Mínimo</td><td style="padding:6px 0;">${prod.stockMinimo}</td></tr>
        <tr><td style="padding:6px 0;color:var(--text-muted);">Precio</td><td style="padding:6px 0;font-weight:600;">${this.fmt(prod.precio)}</td></tr></table>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-warning" data-action="edit-product" data-codigo="${this.escapeHtml(prod.codigo)}" type="button">✏️ Editar</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cerrar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }).catch(err => { this.showMessage('productMsg', 'Error: ' + err.message, 'error'); });
  },


  mostrarFormProducto(codigo) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    if (codigo) {
      obtenerProducto(codigo).then(prod => {
        Promise.all([obtenerGrupos(), obtenerUnidades()]).then(([grupos, unidades]) => {
          modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:550px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow-y:auto;">
            <h3 style="color:var(--primary);margin-bottom:20px;">Editar Producto</h3>
            <div style="text-align:center;margin-bottom:15px;">${prod.imagenUrl ? `<img src="${this.escapeHtml(imgUrl(prod.imagenUrl))}" alt="" style="max-width:100%;max-height:160px;border-radius:10px;object-fit:cover;" onerror="this.remove()">` : '<div style="font-size:2.5rem;">🖼️</div><div style="color:var(--text-muted);font-size:0.85rem;">Sin imagen</div>'}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;padding:10px;background:var(--primary-bg-light);border-radius:8px;">
              <div><span style="color:var(--text-muted);font-size:0.85rem;">Stock Actual</span><br><span style="font-size:1.3rem;font-weight:700;color:${prod.stockActual < prod.stockMinimo ? 'var(--danger)' : 'var(--success)'}">${prod.stockActual}</span></div>
              <div><span style="color:var(--text-muted);font-size:0.85rem;">Valor Inventario</span><br><span style="font-size:1.3rem;font-weight:700;">${this.fmt((prod.stockActual || 0) * (prod.costo || 0))}</span></div>
            </div>
            <div class="form-grid">
              <div class="form-group"><label>Código</label><input type="text" value="${this.escapeHtml(prod.codigo)}" readonly style="background:#f5f5f5;"></div>
              <div class="form-group"><label>Nombre</label><input id="editProdNombre" type="text" value="${this.escapeHtml(prod.nombre)}"></div>
              <div class="form-group"><label>Unidad</label><select id="editProdUnidad">${unidades.map(u => `<option value="${u}" ${prod.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
              <div class="form-group"><label>Grupo</label><select id="editProdGrupo">${grupos.map(g => `<option value="${g}" ${prod.grupo === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
              <div class="form-group"><label>Stock Mín (alerta)</label><input id="editProdStockMin" type="number" min="0" step="0.01" value="${prod.stockMinimo}"></div>
              <div class="form-group"><label>Precio Venta</label><input id="editProdPrecio" type="number" min="0" step="1" value="${prod.precio}"></div>
              <div class="form-group"><label>Costo Unitario</label><input id="editProdCosto" type="number" min="0" step="1" value="${prod.costo || 0}"></div>
              <div class="form-group"><label>Ajustar Stock</label><input id="editAjusteStock" type="number" step="0.01" value="0" placeholder="+/- para ajustar">
                <span class="field-hint">Positivo=INGRESO, Negativo=SALIDA</span></div>
              <div class="form-group"><label for="editProdImagen">Cambiar imagen</label><input id="editProdImagen" type="file" accept="image/jpeg,image/png,image/webp">
                <span class="field-hint">JPG, PNG o WEBP. Máximo 2 MB.</span></div>
            </div>
            <div class="actions" style="margin-bottom:0;">
              <button class="btn btn-success" data-action="update-product" data-codigo="${this.escapeHtml(prod.codigo)}" type="button">Actualizar</button>
              <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
            </div>
          </div>`;
          document.body.appendChild(modal);
        });
      });
    }
  },


  actualizarProductoDesdeModal() {
    const modal = document.querySelector('.modal-backdrop');
    const codigo = modal?.querySelector('[data-codigo]')?.dataset.codigo;
    const nombre = document.getElementById('editProdNombre')?.value?.trim();
    const unidad = document.getElementById('editProdUnidad')?.value;
    const grupo = document.getElementById('editProdGrupo')?.value;
    const stockMinimo = parseFloat(document.getElementById('editProdStockMin')?.value) || 0;
    const precio = Math.round(parseFloat(document.getElementById('editProdPrecio')?.value) || 0);
    const costo = Math.round(parseFloat(document.getElementById('editProdCosto')?.value) || 0);
    const ajuste = parseFloat(document.getElementById('editAjusteStock')?.value) || 0;
    const imagen = document.getElementById('editProdImagen')?.files?.[0];
    if (imagen && imagen.size > 2 * 1024 * 1024) { this.showMessage('productMsg', 'La imagen no puede superar 2 MB', 'error'); return; }
    if (!codigo || !nombre) return;

    const updatePromise = actualizarProducto(codigo, { nombre, unidad, grupo, stockMinimo, precio, costo });

    const withImage = (p) => imagen ? p.then(() => subirImagenProducto(codigo, imagen)) : p;
    const finalPromise = withImage(ajuste !== 0
      ? updatePromise.then(() => {
          const tipo = ajuste > 0 ? 'INGRESO' : 'SALIDA';
          return registrarMovimiento({ codigo, tipo, cantidad: Math.abs(ajuste), nota: 'Ajuste desde editor' });
        })
      : updatePromise);

    finalPromise
      .then(res => { this.cerrarModal(); this.showMessage('productMsg', 'Producto actualizado', 'success'); this.cargarProductos(); })
      .catch(err => { this.showMessage('productMsg', 'Error: ' + err.message, 'error'); });
  },


  // ================== INVENTARIO ==================
  cargarInventario() {
    const container = document.querySelector('#inventario .content-body');
    if (!container) return;
    this.loadingSpinner(container, true);
    obtenerStock().then(stock => {
      container.innerHTML = `
        <div class="card"><div class="card-header">Stock Actual</div><div class="card-body">
          <div class="actions"><button class="btn btn-primary" data-action="refresh-inventario" type="button">🔄 Actualizar</button>
          <button class="btn btn-success" data-action="export-excel-inventario" type="button">📥 Exportar Excel</button></div>
          <div class="table-container">
            <table class="tabla-responsive"><thead><tr><th>Código</th><th>Nombre</th><th>Unidad</th><th>Stock</th><th>Mínimo</th><th>Precio</th><th>Estado</th></tr></thead>
            <tbody>${stock.map(p => `<tr>
              <td data-label="Código">${this.escapeHtml(p.codigo)}</td><td data-label="Nombre" class="prod-nombre-cell">${p.imagenUrl ? `<img src="${this.escapeHtml(imgUrl(p.imagenUrl))}" alt="" loading="lazy" onerror="this.remove()" class="prod-thumb">` : '<span class="prod-sin-imagen" aria-hidden="true">🖼️</span>'}<span>${this.escapeHtml(p.nombre)}</span></td><td data-label="Unidad">${this.escapeHtml(p.unidad)}</td>
              <td data-label="Stock" style="font-weight:600;color:${p.stockActual < p.stockMinimo ? 'var(--danger)' : 'var(--success)'}">${p.stockActual}</td>
              <td data-label="Mínimo">${p.stockMinimo}</td><td data-label="Precio">${this.fmt(p.precio)}</td>
              <td data-label="Estado">${p.stockActual < p.stockMinimo ? '<span class="badge badge-bajo">⚠ Bajo</span>' : '<span class="badge badge-ok">✔ OK</span>'}</td>
            </tr>`).join('')}</tbody></table>
          </div>
        </div></div>`;
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  }
});
