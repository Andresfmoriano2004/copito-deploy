// Copito POS — Reportes y exportar Excel.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== REPORTES ==================
  cargarReportes() {
    const container = document.querySelector('#reportes .content-body');
    if (!container) return;
    obtenerStock().then(stock => {
      const totalProd = stock.length;
      const valorInv = stock.reduce((s, p) => s + p.stockActual * p.precio, 0);
      const bajoStock = stock.filter(p => p.stockActual < p.stockMinimo).length;
      const hoy = new Date();
      const mesInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
      const hoyStr = hoy.toISOString().split('T')[0];
      const hace3meses = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1).toISOString().split('T')[0];
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${totalProd}</div><div class="stat-label">Total Productos</div></div>
          <div class="stat-card"><div class="stat-value">${this.fmt(valorInv)}</div><div class="stat-label">Valor Inventario</div></div>
          <div class="stat-card"><div class="stat-value" style="color:${bajoStock > 0 ? 'var(--danger)' : 'var(--success)'}">${bajoStock}</div><div class="stat-label">Stock Bajo</div></div>
        </div>
        <div class="card"><div class="card-header">📄 Historial de Movimientos</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group"><label for="fechaDesde">Desde</label><input id="fechaDesde" type="date" value="${mesInicio}"></div>
            <div class="form-group"><label for="fechaHasta">Hasta</label><input id="fechaHasta" type="date" value="${hoyStr}"></div>
          </div>
          <div class="actions">
            <button class="btn btn-primary" data-action="generate-report" type="button">📋 Generar Reporte</button>
            <button class="btn btn-success" data-action="export-excel-movimientos" type="button">📥 Exportar Excel</button>
          </div>
          <div class="table-container"><div id="historialTable" aria-live="polite"></div></div>
        </div></div>
        <div class="card"><div class="card-header">📦 Productos con Stock Bajo</div><div class="card-body"><div class="table-container">
          <table><thead><tr><th>Código</th><th>Nombre</th><th>Stock</th><th>Mínimo</th></tr></thead>
          <tbody>${stock.filter(p => p.stockActual < p.stockMinimo).map(p => `<tr>
            <td>${this.escapeHtml(p.codigo)}</td><td>${this.escapeHtml(p.nombre)}</td><td class="text-danger" style="font-weight:600;">${p.stockActual}</td><td>${p.stockMinimo}</td>
          </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--success);">✔ Todo en orden</td></tr>'}</tbody></table>
        </div></div></div>
        <div class="card">
          <div class="card-header">📈 Productos Más Vendidos</div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-group"><label for="ventasDesde">Desde</label><input id="ventasDesde" type="date" value="${mesInicio}"></div>
              <div class="form-group"><label for="ventasHasta">Hasta</label><input id="ventasHasta" type="date" value="${hoyStr}"></div>
            </div>
            <div class="actions"><button class="btn btn-primary" data-action="generar-reporte-ventas" type="button">📊 Ver gráfica</button>
            <button class="btn btn-success" data-action="export-excel-ventas" type="button">📥 Exportar Excel</button></div>
            <div id="ventasChart" style="margin-top:15px;"></div>
            <div id="ventasStats" style="margin-top:15px;"></div>
            <div id="ventasMsg" aria-live="polite"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">📊 Ventas por Semana</div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-group"><label for="semanalDesde">Desde</label><input id="semanalDesde" type="date" value="${hace3meses}"></div>
              <div class="form-group"><label for="semanalHasta">Hasta</label><input id="semanalHasta" type="date" value="${hoyStr}"></div>
            </div>
            <div class="actions"><button class="btn btn-primary" data-action="generar-reporte-semanal" type="button">📊 Ver gráfica semanal</button></div>
            <div id="semanalChart" style="margin-top:15px;"></div>
            <div id="semanalDetalle" style="margin-top:15px;"></div>
            <div id="semanalMsg" aria-live="polite"></div>
          </div>
        </div>
        <div class="actions"><button class="btn btn-primary" data-action="refresh-reportes" type="button">🔄 Actualizar</button></div>`;
      // Auto-generate charts
      setTimeout(() => this.generarReporteVentas(), 100);
      setTimeout(() => this.generarReporteVentasSemanal(), 200);
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },


  // ================== REPORTE DE VENTAS ==================
  generarReporteVentas() {
    const desde = document.getElementById('ventasDesde')?.value;
    const hasta = document.getElementById('ventasHasta')?.value;
    const chartEl = document.getElementById('ventasChart');
    const statsEl = document.getElementById('ventasStats');
    const msgEl = document.getElementById('ventasMsg');
    if (!chartEl) return;
    chartEl.innerHTML = '<div class="loading visible">Cargando...</div>';
    if (statsEl) statsEl.innerHTML = '';
    obtenerReporteVentas(desde, hasta).then(data => {
      const top = data.productos.slice(0, 10);
      const maxTotal = top.length ? Math.max(...top.map(p => p.total)) : 0;
      const totalGeneral = data.totalIngresos;

      // Pie chart colors
      const pieColors = ['#C2185B','#E91E63','#F06292','#F48FB1','#F8BBD0',
                         '#880E4F','#AD1457','#D81B60','#EC407A','#F06292'];

      // Layout: flex row with pie on left, bars on right
      let html = '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;">';

      // --- Pie chart (canvas) ---
      html += '<div style="flex:1;min-width:280px;max-width:400px;"><canvas id="pieChartCanvas" width="400" height="400" style="width:100%;max-width:400px;"></canvas>';
      // Legend
      if (top.length) {
        html += '<div style="margin-top:10px;font-size:0.8rem;">';
        top.forEach((p, i) => {
          html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="width:12px;height:12px;border-radius:3px;background:${pieColors[i % pieColors.length]};flex-shrink:0;"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml(p.nombre)}</span>
            <span style="margin-left:auto;font-weight:600;">${this.fmt(p.total)}</span>
          </div>`;
        });
        html += '</div>';
      }
      html += '</div>';

      // --- Bar chart ---
      html += '<div style="flex:2;min-width:300px;">';
      if (top.length) {
        top.forEach((p, i) => {
          const pct = maxTotal > 0 ? (p.total / maxTotal * 100) : 0;
          const barColor = pieColors[i % pieColors.length];
          html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:0.85rem;">
            <span style="min-width:24px;text-align:right;font-weight:700;color:var(--text-muted);">${i + 1}</span>
            <span style="flex-shrink:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${this.escapeHtml(p.nombre)}</span>
            <div style="flex:2;height:26px;background:var(--primary-bg-light);border-radius:6px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${barColor};border-radius:6px;display:flex;align-items:center;padding-left:8px;transition:width 0.5s ease;">
                <span style="color:white;font-weight:700;font-size:0.75rem;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${this.fmt(p.total)}</span>
              </div>
            </div>
            <span style="min-width:40px;text-align:right;font-weight:600;font-size:0.8rem;color:var(--text-muted);">${p.cantidad} uds</span>
          </div>`;
        });
      } else {
        html += '<div class="message info">No hay ventas en el período seleccionado</div>';
      }
      html += '</div></div>';
      chartEl.innerHTML = html;

      // Draw pie chart
      setTimeout(() => this._dibujarPie(top, totalGeneral, pieColors), 50);

      // Stats
      if (statsEl) {
        statsEl.innerHTML = `<div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${this.fmt(data.totalIngresos)}</div><div class="stat-label">💰 Total Ingresos</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--primary);">${this.fmt(data.sugeridoReinversion)}</div><div class="stat-label">📈 90% para Reinversión</div></div>
          <div class="stat-card"><div class="stat-value">${data.productos.length}</div><div class="stat-label">📦 Productos vendidos</div></div>
        </div>`;
      }
      if (msgEl) msgEl.innerHTML = '';
    }).catch(err => {
      if (msgEl) msgEl.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
      if (chartEl) chartEl.innerHTML = '';
    });
  },


  _dibujarPie(productos, total, colores) {
    const canvas = document.getElementById('pieChartCanvas');
    if (!canvas || !productos.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 20;

    ctx.clearRect(0, 0, w, h);

    let ang = -Math.PI / 2;
    productos.forEach((p, i) => {
      const porcion = total > 0 ? (p.total / total) : 0;
      const angFin = ang + porcion * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, ang, angFin);
      ctx.closePath();
      ctx.fillStyle = colores[i % colores.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label on large enough slices
      if (porcion > 0.05) {
        const medio = ang + porcion * Math.PI;
        const lx = cx + Math.cos(medio) * (r * 0.65);
        const ly = cy + Math.sin(medio) * (r * 0.65);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(porcion * 100) + '%', lx, ly);
      }
      ang = angFin;
    });

    // Center hole for donut effect (optional)
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, 2 * Math.PI);
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#1E1E1E' : '#fff';
    ctx.fill();
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#E8E8E8' : '#212529';
    ctx.font = 'bold 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Top 10', cx, cy);
  },


  // ================== REPORTE SEMANAL ==================
  generarReporteVentasSemanal() {
    const desde = document.getElementById('semanalDesde')?.value;
    const hasta = document.getElementById('semanalHasta')?.value;
    const chartEl = document.getElementById('semanalChart');
    const detalleEl = document.getElementById('semanalDetalle');
    const msgEl = document.getElementById('semanalMsg');
    if (!chartEl) return;
    chartEl.innerHTML = '<div class="loading visible">Cargando...</div>';
    if (detalleEl) detalleEl.innerHTML = '';
    obtenerReporteVentasSemanal(desde, hasta).then(data => {
      const semanas = data.semanas || [];
      if (!semanas.length) {
        chartEl.innerHTML = '<div class="message info">No hay ventas en el período seleccionado</div>';
        return;
      }

      const barColors = ['#FF4081','#F50057','#FF80AB','#C2185B','#E91E63','#F06292','#F48FB1','#880E4F','#AD1457','#D81B60'];
      const maxTotal = Math.max(...semanas.map(s => s.total));

      // ─── Canvas bar chart ───
      const containerWidth = chartEl.clientWidth || 700;
      const w = Math.max(containerWidth, 400);
      const h = 320;
      const padding = { top: 30, right: 20, bottom: 65, left: 80 };
      const chartW = w - padding.left - padding.right;
      const chartH = h - padding.top - padding.bottom;
      const barGap = 6;
      const barW = Math.min(Math.max((chartW - semanas.length * barGap) / semanas.length, 18), 70);

      let html = `<div style="max-width:100%;overflow-x:auto;"><canvas id="semanalBarCanvas" width="${w}" height="${h}" style="width:${w}px;height:${h}px;"></canvas></div>`;
      html += `<div style="text-align:center;margin-top:20px;"><strong>Resumen semanal</strong></div>`;
      chartEl.innerHTML = html;

      // Draw bars
      setTimeout(() => {
        const canvas = document.getElementById('semanalBarCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#E8E8E8' : '#212529';
        const mutedColor = isDark ? '#A0A0A0' : '#6c757d';
        const gridColor = isDark ? '#2C2C2C' : '#e9ecef';

        // Grid lines
        const gridSteps = 5;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= gridSteps; i++) {
          const y = padding.top + chartH - (chartH * i / gridSteps);
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(w - padding.right, y);
          ctx.stroke();
          ctx.fillStyle = mutedColor;
          ctx.fillText(this.fmt(maxTotal * i / gridSteps), padding.left - 8, y);
        }

        // Bars
        semanas.forEach((sem, i) => {
          const x = padding.left + i * (barW + barGap) + barGap / 2;
          const barH = sem.total > 0 ? (sem.total / maxTotal) * chartH : 0;
          const y = padding.top + chartH - barH;

          // Bar
          ctx.fillStyle = barColors[i % barColors.length];
          const radius = 3;
          const barX = x;
          const barY = y;
          const barW2 = barW;
          const barH2 = barH;
          ctx.beginPath();
          ctx.moveTo(barX + radius, barY);
          ctx.lineTo(barX + barW2 - radius, barY);
          ctx.quadraticCurveTo(barX + barW2, barY, barX + barW2, barY + radius);
          ctx.lineTo(barX + barW2, barY + barH2);
          ctx.lineTo(barX, barY + barH2);
          ctx.lineTo(barX, barY + radius);
          ctx.quadraticCurveTo(barX, barY, barX + radius, barY);
          ctx.closePath();
          ctx.fill();

          // Value on top
          ctx.fillStyle = textColor;
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(this.fmt(sem.total), x + barW / 2, y - 4);

          // Week label (angled)
          ctx.save();
          ctx.translate(x + barW / 2, padding.top + chartH + 12);
          ctx.rotate(-0.6);
          ctx.fillStyle = mutedColor;
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          const label = sem.inicio ? sem.inicio.slice(5) + ' - ' + sem.fin.slice(5) : sem.semana;
          ctx.fillText(label, 0, 0);
          ctx.restore();
        });

        // Y-axis label
        ctx.save();
        ctx.translate(15, padding.top + chartH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = mutedColor;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Total Ventas ($)', 0, 0);
        ctx.restore();
      }, 50);

      // ─── Detail table per week ───
      if (detalleEl) {
        let detHtml = '<div class="table-container" style="margin-top:15px;"><table><thead><tr><th>Semana</th><th>Producto</th><th style="text-align:right;">Cantidad</th><th style="text-align:right;">Total</th></tr></thead><tbody>';
        semanas.forEach(sem => {
          const label = sem.inicio ? `${sem.inicio.slice(5)} - ${sem.fin.slice(5)}` : sem.semana;
          const topProds = sem.productos.slice(0, 8);
          topProds.forEach((p, pi) => {
            detHtml += `<tr>
              ${pi === 0 ? `<td rowspan="${topProds.length}" style="vertical-align:middle;font-weight:600;color:${barColors[semanas.indexOf(sem) % barColors.length]};">${label}</td>` : ''}
              <td>${this.escapeHtml(p.nombre)}</td>
              <td style="text-align:right;">${p.cantidad}</td>
              <td style="text-align:right;font-weight:600;">${this.fmt(p.total)}</td>
            </tr>`;
          });
        });
        detHtml += '</tbody></table></div>';

        // Weekly totals row
        detHtml += `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:15px;justify-content:center;">`;
        semanas.forEach(sem => {
          const label = sem.inicio ? sem.inicio.slice(5) + ' - ' + sem.fin.slice(5) : sem.semana;
          detHtml += `<div style="background:var(--primary-bg-light);padding:10px 16px;border-radius:8px;text-align:center;min-width:110px;border-left:4px solid ${barColors[semanas.indexOf(sem) % barColors.length]};">
            <div style="font-size:0.75rem;color:var(--text-muted);">${label}</div>
            <div style="font-weight:700;font-size:1rem;">${this.fmt(sem.total)}</div>
          </div>`;
        });
        detHtml += '</div>';

        detalleEl.innerHTML = detHtml;
      }

      if (msgEl) msgEl.innerHTML = '';
    }).catch(err => {
      if (msgEl) msgEl.innerHTML = `<div class="message error">Error: ${err.message}</div>`;
      if (chartEl) chartEl.innerHTML = '';
    });
  },


  async exportarExcel(tipo) {
    let desde, hasta;
    if (tipo === 'movimientos') {
      desde = document.getElementById('fechaDesde')?.value;
      hasta = document.getElementById('fechaHasta')?.value;
    } else if (tipo === 'ventas') {
      desde = document.getElementById('ventasDesde')?.value;
      hasta = document.getElementById('ventasHasta')?.value;
    }
    const params = new URLSearchParams();
    params.set('tipo', tipo);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);

    try {
      const res = await fetch(`${API_BASE}/reportes/exportar-excel?${params.toString()}`, {
        headers: { ...authHeaders() }
      });
      await handleAuth(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Error al exportar reporte');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `reporte_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`;
      if (contentDisposition) {
        const m = contentDisposition.match(/filename="?([^";]+)"?/);
        if (m && m[1]) filename = m[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      this.showMessage('reportesMsg', err.message || 'Error al exportar', 'error');
    }
  }
});
