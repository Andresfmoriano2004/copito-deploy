// Copito POS — Mesa layout, navigation, and order creation.
// Extends the global App facade. Loaded after app.js.
Object.assign(App, {

  cargarVistaMesas() {
    const container = document.querySelector('#mesas .content-body');
    if (!container) return;
    this.state.mesaMode = 'activas';
    this.actualizarBotonesModo();
    Promise.all([obtenerPedidosActivos(), obtenerMesas()]).then(([pedidos, mesas]) => {
      this.state.pedidosActivos = pedidos;
      container.innerHTML = `
        <div class="actions" style="justify-content:space-between;align-items:center;flex-wrap:wrap;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-success" data-action="nuevo-pedido" type="button">➕ Nuevo Pedido</button>
            <button class="btn btn-primary" data-action="refresh-mesas" type="button">🔄 Actualizar</button>
          </div>
          <div style="display:flex;gap:4px;background:var(--primary-bg-light);border-radius:var(--radius);padding:3px;">
            <button class="btn btn-sm btn-primary" data-action="mesa-mode-activas" type="button">📋 Activas</button>
            <button class="btn btn-sm btn-secondary" data-action="mesa-mode-historial" type="button">📜 Historial</button>
          </div>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:15px;">Precios en Pesos Colombianos ($ COP)</p>
        <div id="mesaView">${this.renderLayoutLocal(pedidos, mesas)}</div>
        <div id="historialView" style="display:none;">
          <div class="card"><div class="card-header">📜 Historial de Pedidos</div><div class="card-body">
            <div class="form-grid">
              <div class="form-group"><label for="histFechaDesde">Desde</label><input id="histFechaDesde" type="date"></div>
              <div class="form-group"><label for="histFechaHasta">Hasta</label><input id="histFechaHasta" type="date"></div>
            </div>
            <div class="actions"><button class="btn btn-primary" data-action="filtrar-historial" type="button">Filtrar</button></div>
            <div class="table-container"><div id="historialPedidosTable" aria-live="polite"></div></div>
          </div></div>
        </div>
        <div id="pedidoDetail" style="display:none;"></div>
        <div id="mesaMsg" aria-live="polite"></div>`;
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },

  cambiarModoMesa(modo) {
    this.state.mesaMode = modo;
    this.actualizarBotonesModo();
    const mesaView = document.getElementById('mesaView');
    const historialView = document.getElementById('historialView');
    const detail = document.getElementById('pedidoDetail');
    if (detail) detail.style.display = 'none';
    if (modo === 'historial') {
      if (mesaView) mesaView.style.display = 'none';
      if (historialView) historialView.style.display = 'block';
      this.cargarHistorialPedidos();
    } else {
      if (mesaView) mesaView.style.display = 'block';
      if (historialView) historialView.style.display = 'none';
    }
  },

  actualizarBotonesModo() {
    const activasBtn = document.querySelector('[data-action="mesa-mode-activas"]');
    const historialBtn = document.querySelector('[data-action="mesa-mode-historial"]');
    if (activasBtn) activasBtn.className = 'btn btn-sm ' + (this.state.mesaMode !== 'historial' ? 'btn-primary' : 'btn-secondary');
    if (historialBtn) historialBtn.className = 'btn btn-sm ' + (this.state.mesaMode === 'historial' ? 'btn-primary' : 'btn-secondary');
  },

  cargarHistorialPedidos() {
    const desde = document.getElementById('histFechaDesde')?.value;
    const hasta = document.getElementById('histFechaHasta')?.value;
    const filtros = {};
    if (desde) filtros.fecha_desde = desde;
    if (hasta) filtros.fecha_hasta = hasta;
    obtenerHistorialPedidos(Object.keys(filtros).length ? filtros : null).then(pedidos => {
      this.mostrarHistorialPedidos(pedidos);
    }).catch(err => { this.showMessage('historialPedidosTable', 'Error: ' + err.message, 'error'); });
  },

  mostrarHistorialPedidos(pedidos) {
    const container = document.getElementById('historialPedidosTable');
    if (!container) return;
    if (!pedidos || !pedidos.length) { container.innerHTML = '<div class="message info">No hay pedidos registrados</div>'; return; }
    container.innerHTML = `<div class="message success">${pedidos.length} pedido(s) encontrados</div>
      <table class="tabla-responsive"><thead><tr><th>Pedido</th><th>Mesa</th><th>Cliente</th>${this.state.user?.rol === 'admin' ? '<th>Colaborador</th>' : ''}<th>Fecha</th><th>Hora</th><th>Total</th><th>Pago</th><th>Estado</th><th>PDF</th><th>Detalle</th></tr></thead>
      <tbody>${pedidos.map(p => `<tr>
        <td data-label="Pedido"><strong>${this.escapeHtml(p.id)}</strong></td>
        <td data-label="Mesa">${this.escapeHtml(p.lugar)}</td>
        <td data-label="Cliente">${this.escapeHtml(p.cliente) || '---'}</td>
        ${this.state.user?.rol === 'admin' ? `<td data-label="Colaborador">${this.escapeHtml(p.vendedor) || '---'}</td>` : ''}
        <td data-label="Fecha">${p.fechaCreacion}</td>
        <td data-label="Hora">${p.horaCreacion || this.fmtHora(p.fechaCreacionISO)}</td>
        <td data-label="Total"><strong>${this.fmt(p.total)}</strong></td>
        <td data-label="Pago">${p.metodoPago || '---'}</td>
        <td data-label="Estado">${this.badgeEstado(p.estado)}${p.estado === 'Cancelado' && p.cancelacionMotivo ? `<br><small style="color:var(--danger-text);font-size:0.7rem;font-weight:600;" title="${this.escapeHtml(p.cancelacionMotivo)}">📝 ${this.escapeHtml(p.cancelacionMotivo.length > 40 ? p.cancelacionMotivo.substring(0, 40) + '…' : p.cancelacionMotivo)}</small>` : ''}</td>
        <td><button class="btn btn-info" style="padding:4px 10px;font-size:0.8rem;" data-action="descargar-factura" data-pedidoid="${p.id}" type="button">🖨️ Ticket</button></td>
        <td><button class="btn btn-outline" style="padding:4px 10px;font-size:0.8rem;" data-action="ver-historial-pedido" data-pedidoid="${p.id}" type="button">🔍 Ver</button></td>
      </tr>`).join('')}</tbody></table>`;
  },

  mostrarDetallePedidoHistorico(pedido) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    let itemsHtml = '';
    if (pedido.items && pedido.items.length) {
      itemsHtml = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead><tr style="background:var(--primary-bg-light);"><th style="padding:8px;text-align:left;">Producto</th><th style="padding:8px;text-align:center;">Cant.</th><th style="padding:8px;text-align:right;">P/U</th><th style="padding:8px;text-align:right;">Subtotal</th></tr></thead>
        <tbody>${pedido.items.map(item => `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px;">${this.escapeHtml(item.nombre)}${item.notas ? '<br><small style="color:var(--text-muted);">📝 ' + this.escapeHtml(item.notas) + '</small>' : ''}</td>
          <td style="padding:8px;text-align:center;">${item.cantidad}</td>
          <td style="padding:8px;text-align:right;">${this.fmt(item.precioUnitario)}</td>
          <td style="padding:8px;text-align:right;">${this.fmt(item.subtotal)}</td>
        </tr>`).join('')}</tbody></table>`;
    } else { itemsHtml = '<p style="color:var(--text-muted);">Sin items</p>'; }
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:600px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      <h3 style="color:var(--primary);margin-bottom:5px;">${this.escapeHtml(pedido.id)}</h3>
      <div class="pedido-meta" style="margin-bottom:15px;">
        <span class="pedido-meta-item">🍽️ ${this.escapeHtml(pedido.lugar)}</span>
        <span class="pedido-meta-item">👤 ${pedido.cliente ? this.escapeHtml(pedido.cliente) : 'Sin cliente'}</span>
        <span class="pedido-meta-item">📅 ${pedido.fechaCreacion}${pedido.horaCreacion ? ' · 🕐 ' + pedido.horaCreacion : ''}</span>
        ${pedido.vendedor ? `<span class="pedido-meta-item">🧑‍🍳 ${this.escapeHtml(pedido.vendedor)}</span>` : ''}
        <span class="pedido-meta-item">${this.badgeEstado(pedido.estado)}</span>
        ${pedido.metodoPago ? `<span class="pedido-meta-item">💳 ${this.escapeHtml(pedido.metodoPago)}</span>` : ''}
      </div>
      ${itemsHtml}
      <div style="margin-top:20px;padding-top:15px;border-top:2px solid var(--primary);text-align:right;font-size:1.4rem;font-weight:700;color:var(--primary-dark);">Total: ${this.fmt(pedido.total)}</div>
      <div class="actions" style="margin-top:20px;margin-bottom:0;">
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cerrar</button>
        <button class="btn btn-info" data-action="descargar-factura" data-pedidoid="${pedido.id}" type="button">🖨️ Imprimir Ticket</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  },

  renderLayoutLocal(pedidos, mesas = []) {
    const ocupados = {};
    pedidos.forEach(p => { ocupados[p.lugar] = p; });
    const cardClass = (estado) => {
      const map = { 'Ocupada': 'ocupada', 'En pago': 'en-pago', 'Pagada': 'pagada', 'Cancelada': 'cancelada', 'Disponible': 'libre', 'Reservada': 'libre' };
      return map[estado] || 'libre';
    };
    const renderCard = lugar => {
      const pedido = ocupados[lugar.id];
      if (pedido) {
        const estado = pedido.estadoMesa || 'Ocupada';
        return `<div class="lugar-card ${cardClass(estado)}" data-action="ver-pedido" data-pedidoid="${pedido.id}">
        <div class="lugar-icon">${lugar.icon}</div>
        <div class="lugar-nombre">${lugar.label}</div>
        ${this.badgeEstado(estado)}
        <div class="lugar-cliente">${pedido.cliente || 'Sin cliente'}</div>
        <div class="lugar-total">${this.fmt(pedido.total)}</div>
        ${pedido.saldo > 0 && pedido.totalPagado > 0 ? `<div class="lugar-saldo">Abonado ${this.fmt(pedido.totalPagado)} · Pendiente ${this.fmt(pedido.saldo)}</div>` : ''}</div>`;
      }
      return `<div class="lugar-card libre" data-action="nuevo-pedido" data-lugar="${lugar.id}">
        <div class="lugar-icon">${lugar.icon}</div>
        <div class="lugar-nombre">${lugar.label}</div>
        <div class="lugar-cliente">Disponible</div></div>`;
    };
    const badge = (estado) => {
      const map = { 'Disponible': ['var(--success-bg)', 'var(--success-text)', '🟢'], 'Ocupada': ['var(--info-bg)', 'var(--info-text)', '🔵'], 'En pago': ['var(--warning-bg)', 'var(--warning-text)', '🟡'], 'Pagada': ['var(--success-bg)', 'var(--success-text)', '🟢'], 'Reservada': ['var(--info-bg)', 'var(--info-text)', '🔵'] };
      const [bg, color, dot] = map[estado] || map['Disponible'];
      return `<span class="mesa-estado" style="background:${bg};color:${color};">${dot} ${estado}</span>`;
    };
    const mesasConfiguradas = mesas.length ? mesas : this.LUGARES.filter(l => l.tipo === 'mesa').map((l, i) => ({ id: i + 1, nombre: l.id, capacidad: 4, posX: i % 2, posY: Math.floor(i / 2), estado: ocupados[l.id] ? (ocupados[l.id].estadoMesa || 'Ocupada') : 'Disponible' }));
    const mesasMap = mesasConfiguradas.map(m => {
      const pedido = ocupados[m.nombre];
      const estado = pedido ? (pedido.estadoMesa || m.estado || 'Ocupada') : (m.estado || 'Disponible');
      const cls = pedido ? cardClass(estado) : 'libre';
      const card = pedido ? `<div class="lugar-card ${cls}" data-action="ver-pedido" data-pedidoid="${this.escapeHtml(pedido.id)}"><div class="lugar-icon">🍽️</div><div class="lugar-nombre">${this.escapeHtml(m.nombre)}</div>${badge(estado)}<div class="lugar-cliente">${this.escapeHtml(pedido.cliente || 'Sin cliente')} · ${m.capacidad} pax</div><div class="lugar-total">${this.fmt(pedido.total)}</div>${pedido.saldo > 0 && pedido.totalPagado > 0 ? `<div class="lugar-saldo">Abonado ${this.fmt(pedido.totalPagado)} · Pendiente ${this.fmt(pedido.saldo)}</div>` : ''}</div>` : `<div class="lugar-card libre" data-action="nuevo-pedido" data-lugar="${this.escapeHtml(m.nombre)}"><div class="lugar-icon">🍽️</div><div class="lugar-nombre">${this.escapeHtml(m.nombre)}</div>${badge(estado)}<div class="lugar-cliente">${estado === 'Reservada' ? 'Reservada' : 'Disponible'} · ${m.capacidad} pax</div></div>`;
      return `<div style="grid-column:${m.posX + 1};grid-row:${m.posY + 1};position:relative;">${card}${this.state.user?.rol === 'admin' && m.id ? `<button class="btn-icon" data-action="configurar-mesa" data-mesaid="${m.id}" data-mesanombre="${this.escapeHtml(m.nombre)}" title="Configurar mesa" style="position:absolute;right:4px;top:4px;z-index:2;">⚙️</button>` : ''}</div>`;
    }).join('');
    return `<div class="zona"><div class="zona-titulo">🥃 Barra</div><div class="lugares-grid">${this.LUGARES.filter(l => l.tipo === 'barra').map(renderCard).join('')}</div></div>
      <div class="zona"><div class="zona-titulo">🛋️ Sofá</div><div class="lugares-grid">${this.LUGARES.filter(l => l.tipo === 'sofa').map(renderCard).join('')}</div></div>
      <div class="zona"><div class="zona-titulo">🍽️ Mesas</div><div class="lugares-grid mesa-map">${mesasMap}</div></div>`;
  },

  configurarMesa(id, nombre) {
    const posX = prompt(`Columna de ${nombre} (0-3):`, '0');
    if (posX === null) return;
    const posY = prompt(`Fila de ${nombre} (0-3):`, '0');
    if (posY === null) return;
    const capacidad = prompt(`Capacidad de ${nombre} (personas):`, '4');
    if (capacidad === null) return;
    const estadoManual = prompt(`Estado base de ${nombre} (Disponible o Reservada):`, 'Disponible');
    if (estadoManual === null) return;
    const data = { posX: parseInt(posX) || 0, posY: parseInt(posY) || 0, capacidad: parseInt(capacidad) || 4 };
    if (/^reservada$/i.test(estadoManual.trim())) data.estadoManual = 'Reservada';
    else data.estadoManual = 'Disponible';
    actualizarMesa(id, data)
      .then(res => { this.showMessage('mesaMsg', res.mensaje, 'success'); this.cargarVistaMesas(); })
      .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
  },

  mostrarFormNuevoPedido(lugar) {
    if (lugar) { this.crearPedidoDirecto(lugar); return; }
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:20px;">Nuevo Pedido</h3>
      <div class="form-group" style="margin-bottom:15px;"><label for="nuevoLugar">Lugar</label>
        <select id="nuevoLugar" class="form-select">${this.LUGARES.map(l => `<option value="${l.id}">${l.icon} ${l.label}${this.state.pedidosActivos.find(p => p.lugar === l.id) ? ' (ocupado)' : ''}</option>`).join('')}</select></div>
      <div class="form-group" style="margin-bottom:20px;"><label for="nuevoCliente">Cliente (opcional)</label><input id="nuevoCliente" type="text" placeholder="Nombre del cliente"></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="crear-pedido" type="button">Crear Pedido</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  },

  crearPedidoDirecto(lugar) {
    const lugarObj = this.LUGARES.find(l => l.id === lugar);
    this.showMessage('mesaMsg', `Abriendo ${lugarObj ? lugarObj.label : lugar}...`, 'success');
    crearPedido(lugar, '').then(res => {
      if (res.error) { this.showMessage('mesaMsg', res.error, 'error'); return; }
      this.showMessage('mesaMsg', res.reabierto ? `↩️ ${lugar} ocupada: pedido existente reabierto. Agregue productos sin perder lo anterior.` : res.mensaje, 'success');
      this.state.currentPedidoId = res.pedidoId;
      this.verPedido(res.pedidoId, true);
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

  crearPedido() {
    const lugar = document.getElementById('nuevoLugar')?.value;
    const cliente = document.getElementById('nuevoCliente')?.value;
    if (!lugar) { this.showMessage('mesaMsg', 'Seleccione un lugar', 'error'); return; }
    crearPedido(lugar, cliente).then(res => {
      this.cerrarModal();
      if (res.error) { this.showMessage('mesaMsg', res.error, 'error'); return; }
      this.showMessage('mesaMsg', res.reabierto ? `↩️ Pedido existente reabierto en ${lugar}.` : res.mensaje, 'success');
      this.state.currentPedidoId = res.pedidoId;
      this.verPedido(res.pedidoId, true);
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

  verPedido(pedidoId) {
    this.state.currentPedidoId = pedidoId;
    const mesaView = document.getElementById('mesaView');
    const detail = document.getElementById('pedidoDetail');
    if (mesaView) mesaView.style.display = 'none';
    if (detail) detail.style.display = 'block';
    this.mostrarPosOrder(pedidoId);
  },

  _openPdf(res) {
    if (!res.pdf) return;
    const byteChars = atob(res.pdf);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const byteArr = new Uint8Array(byteNums);
    const blob = new Blob([byteArr], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  descargarFactura(pedidoId) {
    if (window.Ticket) { Ticket.mostrarModal(pedidoId); } else { descargarPDFPedido(pedidoId); }
  }
});
