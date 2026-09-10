// Copito POS — Dashboard general.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== DASHBOARD ==================
  // Fase 2: 1 llamada agregada; fallback legacy si el servidor no la tiene.
  cargarDashboard() {
    const content = document.querySelector('#dashboard .content-body');
    if (!content) return;
    apiGet('/dashboard/resumen')
      .then(r => this.pintarDashboard(content, r.stock || [], r.pedidosActivos || 0, r.valoracion || null))
      .catch(() => Promise.all([obtenerStock(), obtenerPedidosActivos(), obtenerValoracionInventario()])
        .then(([stock, pedidos, valoracion]) => this.pintarDashboard(content, stock, pedidos.length, valoracion))
        .catch(err => { this.showMessage(content, 'Error: ' + err.message, 'error'); }));
  },

  pintarDashboard(content, stock, totalPedidos, valoracion) {
    this.state.stockData = stock;
    const totalProd = stock.length;
    const bajoStock = stock.filter(p => p.stockActual < p.stockMinimo).length;
    const valorInv = valoracion ? valoracion.total : 0;
        content.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card"><div class="stat-value">${totalProd}</div><div class="stat-label">Productos</div></div>
            <div class="stat-card"><div class="stat-value" style="color:${bajoStock > 0 ? 'var(--danger)' : 'var(--success)'}">${bajoStock}</div><div class="stat-label">Stock Bajo</div></div>
            <div class="stat-card"><div class="stat-value">${totalPedidos}</div><div class="stat-label">Pedidos Activos</div></div>
            <div class="stat-card"><div class="stat-value">${this.fmt(valorInv)}</div><div class="stat-label">Valor Inventario (costo)</div></div>
          </div>
          ${valoracion && valoracion.items && valoracion.items.length ? `
          <div class="card"><div class="card-header">💰 Valoración del Inventario</div><div class="card-body"><div class="table-container">
            <table><thead><tr><th>Producto</th><th>Stock</th><th>Costo Unit.</th><th>Valor Total</th></tr></thead>
            <tbody>${valoracion.items.slice(0, 15).map(i => `<tr>
              <td>${this.escapeHtml(i.nombre)}</td>
              <td>${i.stockActual}</td>
              <td>${this.fmt(i.costo)}</td>
              <td><strong>${this.fmt(i.valorTotal)}</strong></td>
            </tr>`).join('')}</tbody>
            <tfoot><tr style="font-weight:700;background:var(--primary-bg-light);"><td colspan="3">TOTAL INVENTARIO</td><td>${this.fmt(valoracion.total)}</td></tr></tfoot></table>
          </div></div></div>` : ''}
          <div class="card"><div class="card-header">📋 Últimos Productos</div><div class="card-body"><div class="table-container">
            <table><thead><tr><th>Código</th><th>Nombre</th><th>Stock</th><th>Mínimo</th><th>Precio</th><th>Costo</th></tr></thead>
            <tbody>${stock.slice(0, 10).map(p => `<tr>
              <td>${this.escapeHtml(p.codigo)}</td>
              <td>${this.escapeHtml(p.nombre)}</td>
              <td style="color:${p.stockActual < p.stockMinimo ? 'var(--danger)' : 'var(--success)'};font-weight:600;">${p.stockActual}</td>
              <td>${p.stockMinimo}</td>
              <td>${this.fmt(p.precio)}</td>
              <td>${this.fmt(p.costo || 0)}</td>
            </tr>`).join('')}</tbody></table>
          </div></div></div>`;
  }
});
