// Copito POS — Búsqueda global.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== BUSCAR ==================
  cargarBuscar() {
    const container = document.querySelector('#buscar .content-body');
    if (!container) return;
    obtenerProductos().then(productos => {
      container.innerHTML = `
        <div class="card"><div class="card-header">Buscar Productos</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group"><label for="globalSearch">Buscar por nombre, código o categoría</label>
              <div class="search-box"><span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="5.5"/><path d="M16 16l5 5"/></svg></span><input id="globalSearch" type="text" placeholder="Escriba para buscar..." autocomplete="off"></div>
            </div>
          </div>
          <div class="table-container"><table class="tabla-responsive"><thead><tr><th>Código</th><th>Nombre</th><th>Unidad</th><th>Grupo</th><th>Stock</th><th>Precio</th></tr></thead>
            <tbody id="searchResultsBody">
              ${productos.map(p => `<tr>
                <td data-label="Código">${this.escapeHtml(p.codigo)}</td><td data-label="Nombre">${this.escapeHtml(p.nombre)}</td><td data-label="Unidad">${this.escapeHtml(p.unidad)}</td>
                <td data-label="Grupo">${this.escapeHtml(p.grupo)}</td><td data-label="Stock" style="font-weight:600;color:${p.stockActual < p.stockMinimo ? 'var(--danger)' : 'var(--success)'}">${p.stockActual}</td>
                <td data-label="Precio">${this.fmt(p.precio)}</td>
              </tr>`).join('')}
            </tbody></table>
          </div>
        </div></div>`;

      const searchInput = document.getElementById('globalSearch');
      const renderBusqueda = (lista) => {
        const tbody = document.getElementById('searchResultsBody');
        if (!tbody) return;
        tbody.innerHTML = lista.map(p => `<tr>
          <td data-label="Código">${this.escapeHtml(p.codigo)}</td><td data-label="Nombre">${p.imagenUrl ? `<img src="${this.escapeHtml(imgUrl(p.imagenUrl))}" alt="" loading="lazy" onerror="this.remove()" class="prod-thumb">` : ''}${this.escapeHtml(p.nombre)}</td><td data-label="Unidad">${this.escapeHtml(p.unidad)}</td>
          <td data-label="Grupo">${this.escapeHtml(p.grupo)}</td><td data-label="Stock" style="font-weight:600;color:${p.stockActual < p.stockMinimo ? 'var(--danger)' : 'var(--success)'}">${p.stockActual}</td>
          <td data-label="Precio">${this.fmt(p.precio)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Sin resultados</td></tr>';
      };
      if (searchInput) {
        let t = null;
        searchInput.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            const q = searchInput.value.trim();
            if (q.length >= 2) buscarProductos(q).then(renderBusqueda).catch(() => {});
            else if (!q) obtenerProductos().then(renderBusqueda).catch(() => {});
          }, 250);
        });
      }
    });
  }
});
