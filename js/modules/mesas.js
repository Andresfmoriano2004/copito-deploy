// Copito POS — Mesas, pedidos, split bill y pagos.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== MESAS / PEDIDOS ==================
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
        <tbody>${pedido.items.map(item => `<tr style="border-bottom:1px solid var(--border-light);">
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
    const data = { posX, posY, capacidad };
    if (/^reservada$/i.test(estadoManual.trim())) data.estadoManual = 'Reservada';
    else data.estadoManual = 'Disponible';
    actualizarMesa(id, data)
      .then(res => { this.showMessage('mesaMsg', res.mensaje, 'success'); this.cargarVistaMesas(); })
      .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
  },


  mostrarFormNuevoPedido(lugar) {
    if (lugar) {
      this.crearPedidoDirecto(lugar);
      return;
    }
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
      // Diferencia clara: pedido nuevo vs agregar a pedido existente (mesa ocupada)
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


  mostrarMenuProductos() {
    this.cerrarModal();
    obtenerProductos().then(productos => {
      this.state.productosConPrecio = productos;
      const grupos = [...new Set(productos.map(p => p.grupo))];
      let menuHtml = '';
      grupos.forEach(grupo => {
        const prods = productos.filter(p => p.grupo === grupo);
        menuHtml += `<div class="menu-grupo">
          <h4 class="menu-grupo-titulo">📦 ${this.escapeHtml(grupo)}</h4>
          <div class="menu-grid">
          ${prods.map(p => {
            const agotado = (p.stockActual || 0) <= 0;
            return `<button class="menu-item${agotado ? ' menu-item-agotado' : ''}" data-action="${agotado ? '' : 'seleccionar-producto-menu'}" data-codigo="${this.escapeHtml(p.codigo)}" data-nombre="${this.escapeHtml(p.nombre)}" data-precio="${p.precio}" ${agotado ? 'disabled title="Sin stock disponible"' : ''}>
            <div class="menu-item-nombre">${this.escapeHtml(p.nombre)}</div>
            <div class="menu-item-precio">${this.fmt(p.precio)}</div>
            ${agotado ? '<div class="menu-item-agotado-badge">AGOTADO</div>' : ''}
          </button>`;
          }).join('')}
          </div>
        </div>`;
      });

      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div class="modal-menu-container">
        <div class="modal-menu-header">
          <h3 class="modal-menu-title">📋 Menú — seleccione un producto</h3>
          <button class="btn btn-secondary btn-sm" data-action="cerrar-modal" type="button">Cerrar</button>
        </div>${menuHtml}</div>`;
      document.body.appendChild(modal);
    }).catch(err => { this.showMessage('mesaMsg', 'Error al cargar menú: ' + err.message, 'error'); });
  },


  seleccionarProductoMenu(codigo) {
    const prod = this.state.productosConPrecio.find(p => p.codigo === codigo);
    if (prod) this.mostrarFormCantidad(prod.codigo, prod.nombre, prod.precio);
  },


  mostrarFormCantidad(codigo, nombre, precioBase) {
    this.cerrarModal();
    const esSplit = this.state.currentCuentasPedido.length > 0;
    const cuentas = this.state.currentCuentasPedido;
    const cuentaActual = this.state.currentCuentaSeleccionada || (cuentas[0] || 'A');
    let accountHtml = '';
    if (esSplit) {
      accountHtml = `<div class="form-group" style="grid-column:span 2;"><label>Cuenta</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${cuentas.map(c => {
          const color = this.getCuentaColor(c);
          const active = c === cuentaActual;
          return `<button type="button" class="btn btn-sm cuenta-select-btn${active ? ' active' : ''}" data-cuenta="${c}"
            style="padding:6px 14px;border-radius:6px;border:2px solid ${active ? color.text : 'var(--border)'};background:${active ? color.bg : 'transparent'};color:${active ? color.text : 'var(--text-muted)'};font-weight:${active ? '700' : '500'};cursor:pointer;">
            ${this.getCuentaIcon(c)} ${c}</button>`;
        }).join('')}</div></div>`;
    }
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);" data-codigo="${this.escapeHtml(codigo)}">
      <h3 style="color:var(--primary);margin-bottom:5px;">${this.escapeHtml(nombre)}</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:20px;">Precio base: <strong>${this.fmt(precioBase)}</strong></p>
      ${accountHtml}
      <div class="form-grid" style="grid-template-columns:1fr 1fr;">
        <div class="form-group"><label for="cantMenu">Cantidad</label><input id="cantMenu" type="number" min="0.01" step="1" value="1" required></div>
        <div class="form-group"><label for="precioMenu">Precio Unitario <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem;">(modificable)</span></label>
          <input id="precioMenu" type="number" min="0" step="1" value="${precioBase}" style="border-color:var(--warning);font-weight:600;"></div>
      </div>
      <div class="form-group" style="margin-bottom:15px;"><label for="notasMenu">Notas</label><input id="notasMenu" type="text" placeholder="Ej: sin hielo, bien tostado"></div>
      <div style="margin-bottom:15px;text-align:center;font-size:1.2rem;color:var(--primary-dark);font-weight:700;">Subtotal: <span id="previewSubtotal">${this.fmt(precioBase)}</span></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="guardar-item-menu" type="button" style="flex:1;">Agregar al Pedido</button>
        <button class="btn btn-secondary" data-action="cancelar-item-form" type="button">Cancelar</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    if (esSplit) {
      modal.querySelectorAll('.cuenta-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          modal.querySelectorAll('.cuenta-select-btn').forEach(b => {
            b.classList.remove('active');
            const bc = this.getCuentaColor(b.dataset.cuenta);
            b.style.border = `2px solid var(--border)`;
            b.style.background = 'transparent';
            b.style.color = 'var(--text-muted)';
            b.style.fontWeight = '500';
          });
          btn.classList.add('active');
          const cc = this.getCuentaColor(btn.dataset.cuenta);
          btn.style.border = `2px solid ${cc.text}`;
          btn.style.background = cc.bg;
          btn.style.color = cc.text;
          btn.style.fontWeight = '700';
          this.state.currentCuentaSeleccionada = btn.dataset.cuenta;
        });
      });
    }
    const upd = () => {
      const c = parseFloat(document.getElementById('cantMenu')?.value) || 0;
      const p = parseFloat(document.getElementById('precioMenu')?.value) || 0;
      document.getElementById('previewSubtotal').textContent = App.fmt(App.roundMoney(c * p));
    };
    document.getElementById('cantMenu')?.addEventListener('input', upd);
    document.getElementById('precioMenu')?.addEventListener('input', upd);
  },


  guardarItemMenu() {
    const modal = document.querySelector('.modal-backdrop');
    const codigo = modal?.querySelector('[data-codigo]')?.dataset.codigo;
    const cantidad = parseFloat(document.getElementById('cantMenu')?.value);
    const precioUnitario = Math.round(parseFloat(document.getElementById('precioMenu')?.value) || 0);
    const notas = document.getElementById('notasMenu')?.value?.trim() || '';
    const pedidoId = this.state.currentPedidoId;
    const prod = this.state.productosConPrecio.find(p => p.codigo === codigo);
    if (!codigo || !cantidad || !precioUnitario) { this.showMessage('mesaMsg', 'Complete cantidad y precio', 'error'); return; }
    if (!pedidoId) { this.showMessage('mesaMsg', 'No hay pedido activo', 'error'); return; }
    const data = { codigo, nombre: prod ? prod.nombre : '', cantidad, precioUnitario, notas };
    if (this.state.currentCuentaSeleccionada && this.state.currentCuentasPedido.length > 0) {
      data.cuenta = this.state.currentCuentaSeleccionada;
    }
    agregarItemPedido(pedidoId, data)
      .then(res => { this.cerrarModal(); this.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  mostrarFormModificarItem(detalleId) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      this.cerrarModal();
      // Guardar cuenta actual del item para preservarla si no se selecciona otra
      this.state._editingItemCuenta = item.cuenta || null;
      const esSplit = this.state.currentCuentasPedido.length > 0;
      const cuentas = this.state.currentCuentasPedido;
      const cuentaActual = item.cuenta || this.state.currentCuentaSeleccionada || (cuentas[0] || 'A');
      let accountHtml = '';
      if (esSplit) {
        accountHtml = `<div class="form-group" style="grid-column:span 2;"><label>Cuenta</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${cuentas.map(c => {
            const color = this.getCuentaColor(c);
            const active = c === cuentaActual;
            return `<button type="button" class="btn btn-sm edit-cuenta-btn${active ? ' active' : ''}" data-cuenta="${c}"
              style="padding:6px 14px;border-radius:6px;border:2px solid ${active ? color.text : 'var(--border)'};background:${active ? color.bg : 'transparent'};color:${active ? color.text : 'var(--text-muted)'};font-weight:${active ? '700' : '500'};cursor:pointer;">
              ${this.getCuentaIcon(c)} ${c}</button>`;
          }).join('')}</div></div>`;
      }
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="color:var(--primary);margin-bottom:20px;">Modificar Item</h3>
        <p style="color:var(--text-muted);margin-bottom:15px;">${this.escapeHtml(item.nombre)}</p>
        ${accountHtml}
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label for="editCantMenu">Cantidad</label><input id="editCantMenu" type="number" min="0.01" step="1" value="${item.cantidad}"></div>
          <div class="form-group"><label for="editPrecioMenu">Precio Unitario</label><input id="editPrecioMenu" type="number" min="0" step="1" value="${item.precioUnitario}"></div>
        </div>
        <div class="form-group" style="margin-bottom:15px;"><label for="editNotasMenu">Notas</label><input id="editNotasMenu" type="text" value="${this.escapeHtml(item.notas)}"></div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-success" data-action="guardar-mod-item" data-detalleid="${item.id}" type="button">Guardar</button>
          <button class="btn btn-secondary" data-action="cancelar-item-form" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      if (esSplit) {
        modal.querySelectorAll('.edit-cuenta-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            modal.querySelectorAll('.edit-cuenta-btn').forEach(b => {
              b.classList.remove('active');
              const bc = this.getCuentaColor(b.dataset.cuenta);
              b.style.border = '2px solid var(--border)';
              b.style.background = 'transparent';
              b.style.color = 'var(--text-muted)';
              b.style.fontWeight = '500';
            });
            btn.classList.add('active');
            const cc = this.getCuentaColor(btn.dataset.cuenta);
            btn.style.border = `2px solid ${cc.text}`;
            btn.style.background = cc.bg;
            btn.style.color = cc.text;
            btn.style.fontWeight = '700';
          });
        });
      }
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  guardarModItem(detalleId) {
    const cantidad = parseFloat(document.getElementById('editCantMenu')?.value);
    const precioUnitario = Math.round(parseFloat(document.getElementById('editPrecioMenu')?.value) || 0);
    const notas = document.getElementById('editNotasMenu')?.value?.trim() || '';
    if (!cantidad || !precioUnitario) { this.showMessage('mesaMsg', 'Complete cantidad y precio', 'error'); return; }
    const data = { cantidad, precioUnitario, notas };
    // Usar cuenta seleccionada en el modal, o preservar la cuenta actual del item
    const activeBtn = document.querySelector('.edit-cuenta-btn.active');
    data.cuenta = activeBtn ? activeBtn.dataset.cuenta : (this.state._editingItemCuenta || null);
    modificarItemPedido(detalleId, data)
      .then(res => { this.cerrarModal(); this.showMessage('mesaMsg', res.mensaje, 'success'); if (this.state.currentPedidoId) this.verPedido(this.state.currentPedidoId); })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  confirmarEliminarItem(detalleId) {
    if (!confirm('¿Eliminar este item del pedido?')) return;
    eliminarItemPedido(detalleId)
      .then(res => { this.showMessage('mesaMsg', res.mensaje, 'success'); if (this.state.currentPedidoId) this.verPedido(this.state.currentPedidoId); })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  confirmarCerrarPedido() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const itemsPend = pedido.items.filter(i => !i.pagado);
      const totalPagado = (pedido.pagos || []).reduce((s, p) => App.sumMoney(s, p.monto), 0);
      const saldo = App.subMoney(pedido.total, totalPagado);
      if (saldo <= 0) { this.showMessage('mesaMsg', 'El pedido ya está totalmente pagado', 'warning'); return; }
      const itemsHtml = itemsPend.map(i => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.9rem;"><span>${this.escapeHtml(i.nombre)} x${i.cantidad}</span><strong>${this.fmt(i.subtotal)}</strong></div>`).join('');
      this.mostrarModal(`
        <h3 style="color:var(--primary);margin-bottom:10px;">🔒 Cerrar Pedido</h3>
        <p style="color:var(--text-muted);margin-bottom:10px;font-size:0.9rem;">Productos pendientes por pagar:</p>
        <div style="max-height:200px;overflow-y:auto;margin-bottom:15px;">${itemsHtml}</div>
        <div style="background:var(--primary-bg-light);padding:10px;border-radius:8px;margin-bottom:15px;">
          <div style="display:flex;justify-content:space-between;"><span>Total:</span><strong>${this.fmt(pedido.total)}</strong></div>
          ${totalPagado > 0 ? `<div style="display:flex;justify-content:space-between;color:var(--success-text);"><span>Ya pagado:</span><strong>${this.fmt(totalPagado)}</strong></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;"><span><strong>Pendiente:</strong></span><strong style="color:var(--primary-dark);">${this.fmt(saldo)}</strong></div>
        </div>
        <div class="form-group" style="margin-bottom:15px;">
          <label for="propinaInputPrev" style="color:var(--text-muted);font-size:0.85rem;">💝 Propina (opcional — se registrará <strong>después</strong> del pago de forma independiente)</label>
          <input id="propinaInputPrev" type="number" min="0" step="100" value="0" placeholder="0">
        </div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-success" data-action="confirmar-cerrar-pedido" type="button">💳 Pagar ${this.fmt(saldo)}</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      `);
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

  confirmarCerrarPedidoPago() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    // Leer propina del campo previo (si existe), pero NO sumarla al saldo del pedido
    const propina = parseFloat(document.getElementById('propinaInputPrev')?.value) || 0;
    if (propina < 0) { this.showMessage('mesaMsg', 'La propina no puede ser negativa', 'error'); return; }
    obtenerPedido(pedidoId).then(pedido => {
      const totalPagado = (pedido.pagos || []).reduce((s, p) => App.sumMoney(s, p.monto), 0);
      // FIX: el saldo es SOLO el valor del pedido, sin propina
      const saldo = App.subMoney(pedido.total, totalPagado);
      this.cerrarModal();
      this.mostrarModalPago({
        total: saldo,  // Solo el saldo real del pedido
        titulo: '🔒 Cerrar Pedido',
        onConfirm: (pagos, cambio) => this.procesarCierre(pagos, cambio, propina, pedido.lugar)
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  confirmarCancelarPedido() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      let msg = '¿Cancelar este pedido y liberar la mesa? La información se conservará en el historial.';
      if (pedido.totalPagado > 0) {
        msg += `\n\n⚠️ ATENCIÓN: Este pedido tiene pagos registrados por ${this.fmt(pedido.totalPagado)}.`;
        msg += `\nSe reversarán los movimientos de caja correspondientes.`;
        msg += `\nMotivo de cancelación: (obligatorio)`;
      }
      if (!confirm(msg)) return;
      const motivo = prompt(pedido.totalPagado > 0 ? 'Motivo de cancelación (obligatorio):' : 'Motivo de cancelación:', '');
      if (motivo === null) return;
      if (pedido.totalPagado > 0 && !motivo.trim()) {
        this.showMessage('mesaMsg', 'El motivo es obligatorio cuando hay pagos registrados', 'error');
        return;
      }
      cancelarPedido(pedidoId, motivo.trim() || 'Cancelado por colaborador')
        .then(res => {
          this.state.currentPedidoId = null;
          this.showMessage('mesaMsg', res.mensaje, 'success');
          this.cargarVistaMesas();
        })
        .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
    }).catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
  },


  obtenerTotalActual() {
    const el = document.querySelector('.pedido-total-box');
    if (!el) return 0;
    const text = el.textContent;
    const m = text.match(/([\d,.]+)/);
    if (!m) return 0;
    return parseFloat(m[0].replace(/\./g, '').replace(',', '.')) || 0;
  },


  procesarCierre(pagos, cambio, propina = 0, lugar = null) {
    const totalNum = pagos.reduce((s, p) => App.sumMoney(s, p.monto), 0);
    const metodosStr = pagos.map(p => `${p.metodoPago}: ${this.fmt(p.monto)}`).join(', ');
    let msg = `¿Confirmar cierre del pedido por ${this.fmt(totalNum)}?`;
    msg += `\n\n${metodosStr}\n\nSe descontará el stock de los productos.`;
    if (propina > 0) msg += `\n\nℹ️ La propina de ${this.fmt(propina)} se registrará de forma independiente después del pago.`;
    if (!confirm(msg)) return;
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    // FIX: cerrar pedido SOLO por el total real (sin propina)
    cerrarPedido(pedidoId, pagos, cambio)
      .then(res => {
        this.showMessage('mesaMsg', res.mensaje, 'success');
        this.state.currentPedidoId = null;
        if (res.pdf) {
          this._openPdf(res);
        } else if (window.Ticket) {
          Ticket.mostrarModal(pedidoId, { cambio });
        } else {
          descargarPDFPedido(pedidoId);
        }
        // Mostrar modal de propina DESPUÉS del pago exitoso (si se indicó propina)
        if (propina > 0) {
          this.mostrarModalPropina(pedidoId, lugar);
        } else {
          this.cargarVistaMesas();
        }
      })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  // ================== MODAL DE PROPINA INDEPENDIENTE ==================
  // Se muestra DESPUÉS de que el pedido queda pagado al 100%.
  // La propina NO afecta el total del pedido ni los cálculos de ventas.
  mostrarModalPropina(pedidoId, lugar, propinaSugerida = 0) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:3000;font-family:var(--font);';
    modal.innerHTML = `<div style="background:white;border-radius:16px;padding:30px;max-width:420px;width:92%;box-shadow:0 25px 70px rgba(0,0,0,0.35);border-top:4px solid #e91e8c;">
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:2.5rem;margin-bottom:8px;">💝</div>
        <h3 style="color:#e91e8c;margin:0 0 6px;">Registrar Propina</h3>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0;">Esta propina es <strong>independiente</strong> de la venta de productos y se registrará por separado en la caja.</p>
      </div>
      <div style="background:#fce4ec;border-radius:10px;padding:12px 16px;margin-bottom:18px;border:1px solid #f48fb1;">
        <div style="font-size:0.8rem;font-weight:700;color:#c2185b;margin-bottom:4px;">⚠️ PROPINA — No es parte de la venta</div>
        ${pedidoId ? `<div style="font-size:0.85rem;color:#880e4f;">Pedido: <strong>${this.escapeHtml(pedidoId)}</strong>${lugar ? ' — ' + this.escapeHtml(lugar) : ''}</div>` : '<div style="font-size:0.85rem;color:#880e4f;">Propina general (sin pedido asociado)</div>'}
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label for="propinaMontoModal" style="font-weight:600;">Monto de la Propina</label>
        <input id="propinaMontoModal" type="number" min="0" step="1000" value="${propinaSugerida > 0 ? propinaSugerida : ''}" placeholder="0" style="font-size:1.3rem;font-weight:700;border-color:#e91e8c;">
      </div>
      <div class="form-group" style="margin-bottom:18px;">
        <label for="propinaMetodoModal" style="font-weight:600;">Método de Recepción</label>
        <select id="propinaMetodoModal" style="border-color:#e91e8c;">
          <option value="Efectivo">💵 Efectivo</option>
          <option value="Transferencia">🏦 Transferencia</option>
        </select>
      </div>
      <div class="actions" style="margin-bottom:0;gap:8px;">
        <button class="btn" id="btnConfirmarPropina" style="flex:1;background:#e91e8c;color:white;border:none;font-weight:700;" type="button">💝 Registrar Propina</button>
        <button class="btn btn-secondary" id="btnOmitirPropina" type="button">Omitir</button>
      </div>
      <div id="propinaModalMsg" aria-live="polite" style="margin-top:10px;"></div>
    </div>`;
    document.body.appendChild(modal);

    document.getElementById('btnOmitirPropina').addEventListener('click', () => {
      modal.remove();
      this.cargarVistaMesas();
    });
    document.getElementById('btnConfirmarPropina').addEventListener('click', () => {
      const monto = parseFloat(document.getElementById('propinaMontoModal')?.value) || 0;
      const metodo = document.getElementById('propinaMetodoModal')?.value || 'Efectivo';
      if (monto <= 0) {
        this.showMessage('propinaModalMsg', 'El monto debe ser mayor a cero', 'error');
        return;
      }
      if (monto < 0) {
        this.showMessage('propinaModalMsg', 'La propina no puede ser negativa', 'error');
        return;
      }
      const btn = document.getElementById('btnConfirmarPropina');
      if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }
      registrarPropina({ pedidoId: pedidoId || null, lugar: lugar || null, monto, metodoPago: metodo })
        .then(res => {
          this.showMessage('propinaModalMsg', res.mensaje, 'success');
          setTimeout(() => { modal.remove(); this.cargarVistaMesas(); }, 1500);
        })
        .catch(err => {
          if (btn) { btn.disabled = false; btn.textContent = '💝 Registrar Propina'; }
          this.showMessage('propinaModalMsg', 'Error: ' + err.message, 'error');
        });
    });
  },


  // Acceso directo a modal de propina general (sin pedido) desde Caja
  mostrarModalPropinaGeneral() {
    this.mostrarModalPropina(null, null, 0);
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
    if (window.Ticket) {
      Ticket.mostrarModal(pedidoId);
    } else {
      descargarPDFPedido(pedidoId);
    }
  },


  // ================== SPLIT BILL ==================
  activarSplit() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    const detail = document.getElementById('pedidoDetail');
    obtenerPedido(pedidoId).then(pedido => {
      const sinCuenta = pedido.items.filter(i => !i.cuenta);
      if (!sinCuenta.length) return;
      const cuentas = this.state.cuentas.length >= 2 ? this.state.cuentas : ['A', 'B'];
      // PASO 1: Guardar cuentasActivas PRIMERO (para que validación de cuenta pase)
      actualizarPedido(pedidoId, { cuentasActivas: cuentas }).then(() => {
        // PASO 2: Distribuir items entre cuentas
        const promises = sinCuenta.map((item, idx) => {
          const cuenta = cuentas[idx % cuentas.length];
          return modificarItemPedido(item.id, {
            cantidad: item.cantidad, precioUnitario: item.precioUnitario,
            notas: item.notas, cuenta
          });
        });
        return Promise.all(promises);
      }).then(() => {
        this.showMessage('pedidoDetail', `Items distribuidos entre cuentas: ${cuentas.join(', ')}`, 'success');
        this.verPedido(pedidoId);
      }).catch(err => {
        const msg = detail ? 'pedidoDetail' : 'mesaMsg';
        this.showMessage(msg, 'Error al dividir: ' + err.message, 'error');
      });
    });
  },


  agregarCuenta() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const existentes = this.getCuentasDelPedido(pedido);
      const nueva = this.getSiguienteCuenta(existentes);
      if (!this.state.cuentas.includes(nueva)) {
        this.state.cuentas = [...this.state.cuentas, nueva];
      }
      actualizarPedido(pedidoId, { cuentasActivas: this.state.cuentas }).then(() => {
        this.showMessage('pedidoDetail', `Cuenta ${nueva} agregada. Asigne items usando los botones.`, 'success');
        this.verPedido(pedidoId);
      }).catch(err => {
        this.showMessage('pedidoDetail', 'Error al guardar cuenta: ' + err.message, 'error');
      });
    });
  },


  asignarCuenta(detalleId, cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      modificarItemPedido(detalleId, {
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        notas: item.notas,
        cuenta
      }).then(() => {
        this.verPedido(pedidoId);
      }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
    });
  },


  cerrarCuenta(cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const totalCuenta = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => App.sumMoney(s, i.subtotal), 0);
      if (totalCuenta <= 0) { this.showMessage('mesaMsg', 'Cuenta ' + cuenta + ' no tiene items', 'error'); return; }
      this.mostrarModalPago({
        total: totalCuenta,
        titulo: `🔒 Cerrar Cuenta ${cuenta}`,
        onConfirm: (pagos, cambio) => {
          cerrarCuentaPedido(pedidoId, cuenta, pagos, cambio)
            .then(res => { this._openPdf(res);
              this.showMessage('mesaMsg', res.mensaje, 'success');
              if (this.state.currentCuentaSeleccionada === cuenta) {
                this.state.currentCuentaSeleccionada = null;
              }
              this.verPedido(pedidoId);
            })
            .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
        }
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  // ================== PAGAR ITEM INDIVIDUAL =============
  pagarItem(detalleId) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) { this.showMessage('mesaMsg', 'Item no encontrado', 'error'); return; }
      this.mostrarModalPago({
        total: item.subtotal,
        titulo: `💳 Pagar: ${item.nombre}`,
        onConfirm: (pagos, cambio) => {
          cerrarItemPedido(pedidoId, detalleId, pagos, cambio)
            .then(res => {
              this._openPdf(res);
              this.showMessage('mesaMsg', res.mensaje, 'success');
              this.verPedido(pedidoId);
            })
            .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
        }
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  pagarSeleccionados() {
    const detail = document.getElementById('pedidoDetail');
    if (!detail) return;
    const checked = detail.querySelectorAll('.item-checkbox:checked');
    if (!checked.length) return;
    const detalleIds = Array.from(checked).map(c => parseInt(c.dataset.detalleid));
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const total = detalleIds.reduce((s, id) => {
        const item = pedido.items.find(i => i.id == id);
        return App.sumMoney(s, item ? item.subtotal : 0);
      }, 0);
      // Detectar si todos los items seleccionados son de la misma cuenta
      const cuentasItems = [...new Set(detalleIds.map(id => {
        const it = pedido.items.find(i => i.id == id);
        return it ? (it.cuenta || '__general__') : null;
      }).filter(c => c !== null))];
      const cuentaUnica = cuentasItems.length === 1 ? (cuentasItems[0] === '__general__' ? null : cuentasItems[0]) : null;
      this.mostrarModalPago({
        total,
        titulo: `💳 Pagar ${detalleIds.length} items (${this.fmt(total)})${cuentaUnica ? ` — Cuenta ${cuentaUnica}` : ''}`,
        detalleIds,
        onConfirm: (pagos, cambio) => {
          cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio, cuentaUnica)
            .then(res => {
              this._openPdf(res);
              this.showMessage('mesaMsg', res.mensaje, 'success');
              this.verPedido(pedidoId);
            })
            .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
        }
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  // Pagado acumulado de una cuenta: pagos directos + pagos por item vinculado a ella
  pagosDeCuenta(pedido, cuenta) {
    if (!pedido.pagos) return 0;
    return pedido.pagos.filter(p => {
      if (p.cuenta === cuenta) return true;
      if (p.detalleId) {
        const it = (pedido.items || []).find(i => i.id == p.detalleId);
        return it && it.cuenta === cuenta;
      }
      return false;
    }).reduce((s, p) => App.sumMoney(s, p.monto), 0);
  },


  abonarCuentaUI(cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      let saldo;
      if (cuenta) {
        const totalC = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => App.sumMoney(s, i.subtotal), 0);
        saldo = App.subMoney(totalC, this.pagosDeCuenta(pedido, cuenta));
      } else {
        saldo = pedido.saldoRestante;
      }
      if (!(saldo > 0)) { this.showMessage('mesaMsg', 'Sin saldo pendiente', 'error'); return; }
      this.mostrarModalAbono({
        saldo,
        titulo: cuenta ? `💰 Abonar a Cuenta ${cuenta}` : '💰 Abonar al pedido',
        onConfirm: (pagos) => {
          abonarCuenta(pedidoId, cuenta, pagos).then(res => {
            const acumulado = App.roundMoney(res.acumulado);
            const pendiente = App.roundMoney(res.pendiente);
            const totalAbonado = pagos.reduce((s, p) => App.sumMoney(s, p.monto), 0);
            let msg = res.mensaje;
            msg += ` | Abonado: ${this.fmt(totalAbonado)} | Acumulado: ${this.fmt(acumulado)} | Pendiente: ${this.fmt(pendiente)}`;
            if (res.cuentaCerrada) msg += ' ✔ Cuenta pagada por completo.';
            if (res.pedidoCerrado) msg += ' 🔒 Pedido cerrado.';
            this.showMessage('mesaMsg', msg, 'success');
            if (res.pedidoCerrado && window.Ticket) Ticket.mostrarModal(pedidoId);
            this.verPedido(pedidoId);
          }).catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
        }
      });
    }).catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
  },


  // ================== PAGAR PRODUCTOS SELECCIONADOS DE UNA CUENTA =============
  // Modal que muestra los items pendientes de una cuenta específica con checkboxes
  // para que el usuario seleccione cuáles pagar.
  mostrarModalPagarCuenta(cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    const esGeneral = cuenta === '__general__';
    const filtroCuenta = esGeneral ? null : cuenta;
    obtenerPedido(pedidoId).then(pedido => {
      const itemsCuenta = pedido.items.filter(i => esGeneral ? !i.cuenta : i.cuenta === cuenta);
      const pendientes = itemsCuenta.filter(i => !i.pagado);
      if (!pendientes.length) { this.showMessage('mesaMsg', `${esGeneral ? 'General' : 'Cuenta ' + cuenta} no tiene items pendientes`, 'error'); return; }

      const cColor = esGeneral ? { bg: 'var(--primary-bg-light)', text: 'var(--primary)' } : this.getCuentaColor(cuenta);
      const totalCuenta = itemsCuenta.reduce((s, i) => App.sumMoney(s, i.subtotal), 0);
      const pagadoCuenta = esGeneral ? (pedido.totalPagado - this.pagosDeCuenta(pedido, 'A') - this.pagosDeCuenta(pedido, 'B')) : this.pagosDeCuenta(pedido, cuenta);
      const saldoCuenta = App.subMoney(totalCuenta, Math.max(0, pagadoCuenta));

      const itemsHtml = pendientes.map(item => `
        <label class="item-select-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;cursor:pointer;transition:all 0.15s;">
          <input type="checkbox" class="cta-item-check" data-detalleid="${item.id}" data-subtotal="${item.subtotal}" style="width:20px;height:20px;cursor:pointer;">
          <div style="flex:1;">
            <div style="font-weight:600;">${this.escapeHtml(item.nombre)}</div>
            <div style="font-size:0.85rem;color:var(--text-muted);">${item.cantidad} x ${this.fmt(item.precioUnitario)}</div>
          </div>
          <div style="font-weight:700;">${this.fmt(item.subtotal)}</div>
        </label>
      `).join('');

      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:25px;max-width:500px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="color:${cColor.text};margin-bottom:5px;">${esGeneral ? '📋' : this.getCuentaIcon(cuenta)} Pagar ${esGeneral ? 'General' : 'Cuenta ' + cuenta}</h3>
        <div style="display:flex;gap:15px;flex-wrap:wrap;margin-bottom:15px;font-size:0.9rem;">
          <span>Total: <strong>${this.fmt(totalCuenta)}</strong></span>
          <span>Pagado: <strong style="color:var(--success-text);">${this.fmt(pagadoCuenta)}</strong></span>
          <span>Saldo: <strong style="color:${cColor.text};">${this.fmt(saldoCuenta)}</strong></span>
        </div>
        <div style="margin-bottom:10px;font-weight:600;color:var(--text);">Selecciona los productos a pagar:</div>
        <div style="margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--primary-bg-light);border-radius:8px;cursor:pointer;font-weight:500;">
            <input type="checkbox" id="ctaSelectAll" style="width:18px;height:18px;cursor:pointer;">
            <span>Seleccionar todos (${pendientes.length} items)</span>
          </label>
        </div>
        <div id="ctaItemsList">${itemsHtml}</div>
        <div style="margin-top:15px;padding:12px;background:var(--primary-bg-light);border-radius:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span>Productos seleccionados:</span><strong id="ctaSelectedCount">0</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Total a pagar:</span><strong id="ctaSelectedTotal" style="font-size:1.1rem;">$0</strong>
          </div>
        </div>
        <div class="actions" style="margin-top:15px;margin-bottom:0;">
          <button class="btn btn-success" id="btnCtaPagar" disabled style="flex:1;">💳 Pagar seleccionados</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);

      const updateTotal = () => {
        const checked = modal.querySelectorAll('.cta-item-check:checked');
        let total = 0;
        checked.forEach(cb => { total = App.sumMoney(total, parseFloat(cb.dataset.subtotal) || 0); });
        const count = checked.length;
        document.getElementById('ctaSelectedCount').textContent = count;
        document.getElementById('ctaSelectedTotal').textContent = this.fmt(total);
        document.getElementById('btnCtaPagar').disabled = count === 0;
        document.getElementById('btnCtaPagar').textContent = count > 0 ? `💳 Pagar ${this.fmt(total)}` : '💳 Pagar seleccionados';
      };

      const selectAll = document.getElementById('ctaSelectAll');
      if (selectAll) {
        selectAll.addEventListener('change', () => {
          modal.querySelectorAll('.cta-item-check').forEach(cb => { cb.checked = selectAll.checked; });
          updateTotal();
        });
      }
      modal.querySelectorAll('.cta-item-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const all = modal.querySelectorAll('.cta-item-check');
          const allChecked = all.length > 0 && [...all].every(c => c.checked);
          if (selectAll) selectAll.checked = allChecked;
          updateTotal();
        });
      });

      document.getElementById('btnCtaPagar').addEventListener('click', () => {
        const checked = modal.querySelectorAll('.cta-item-check:checked');
        if (!checked.length) return;
        const detalleIds = [...checked].map(cb => parseInt(cb.dataset.detalleid));
        let total = 0;
        checked.forEach(cb => { total = App.sumMoney(total, parseFloat(cb.dataset.subtotal) || 0); });
        modal.remove();
        this.mostrarModalPago({
          total,
          titulo: `💳 ${esGeneral ? 'General' : 'Cuenta ' + cuenta} — ${detalleIds.length} item(s)`,
          onConfirm: (pagos, cambio) => {
            cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio, filtroCuenta)
              .then(res => {
                this._openPdf(res);
                this.showMessage('mesaMsg', res.mensaje, 'success');
                this.verPedido(pedidoId);
              })
              .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
          }
        });
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  // ================== EDITAR PEDIDO ==================
  mostrarFormEditarPedido() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      this.cerrarModal();
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:450px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="color:var(--primary);margin-bottom:20px;">✏️ Editar Pedido</h3>
        <p style="color:var(--text-muted);margin-bottom:15px;">${this.escapeHtml(pedido.id)} — ${this.escapeHtml(pedido.lugar)}</p>
        <div class="form-grid">
          <div class="form-group"><label for="editPedidoCliente">Cliente</label>
            <input id="editPedidoCliente" type="text" value="${this.escapeHtml(pedido.cliente)}" placeholder="Nombre del cliente"></div>
          <div class="form-group"><label for="editPedidoLugar">Lugar</label>
            <select id="editPedidoLugar">${this.LUGARES.map(l => `<option value="${l.id}" ${pedido.lugar === l.id ? 'selected' : ''}>${l.icon} ${l.label}</option>`).join('')}</select></div>
        </div>
        <div class="form-group" style="margin-bottom:20px;"><label for="editPedidoNotas">Notas</label>
          <textarea id="editPedidoNotas" rows="3" placeholder="Observaciones del pedido">${this.escapeHtml(pedido.notas)}</textarea></div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-success" data-action="guardar-edicion-pedido" type="button">Guardar</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  guardarEdicionPedido() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    const cliente = document.getElementById('editPedidoCliente')?.value?.trim() || '';
    const lugar = document.getElementById('editPedidoLugar')?.value;
    const notas = document.getElementById('editPedidoNotas')?.value?.trim() || '';
    if (!lugar) { this.showMessage('mesaMsg', 'Seleccione un lugar', 'error'); return; }
    actualizarPedido(pedidoId, { cliente, lugar, notas })
      .then(res => { this.cerrarModal(); this.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  }
});
