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
        <td data-label="Estado">${this.badgeEstado(p.estado)}</td>
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
    const renderCard = lugar => {
      const pedido = ocupados[lugar.id];
      if (pedido) return `<div class="lugar-card ocupada" data-action="ver-pedido" data-pedidoid="${pedido.id}">
        <div class="lugar-icon">${lugar.icon}</div>
        <div class="lugar-nombre">${lugar.label}</div>
        <div class="lugar-cliente">${pedido.cliente || 'Sin cliente'}</div>
        <div class="lugar-total">${this.fmt(pedido.total)}</div></div>`;
      return `<div class="lugar-card libre" data-action="nuevo-pedido" data-lugar="${lugar.id}">
        <div class="lugar-icon">${lugar.icon}</div>
        <div class="lugar-nombre">${lugar.label}</div>
        <div class="lugar-cliente">Libre</div></div>`;
    };
    const mesasConfiguradas = mesas.length ? mesas : this.LUGARES.filter(l => l.tipo === 'mesa').map((l, i) => ({ id: i + 1, nombre: l.id, capacidad: 4, posX: i % 2, posY: Math.floor(i / 2), estado: ocupados[l.id] ? (ocupados[l.id].estadoMesa || 'Ocupada') : 'Disponible' }));
    const badge = (estado) => {
      const map = { 'Disponible': ['var(--success-bg)', 'var(--success-text)', '🟢'], 'Ocupada': ['var(--danger-bg)', 'var(--danger-text)', '🔴'], 'En pago': ['var(--warning-bg)', 'var(--warning-text)', '🟡'], 'Reservada': ['var(--info-bg)', 'var(--info-text)', '🔵'] };
      const [bg, color, dot] = map[estado] || map['Disponible'];
      return `<span class="mesa-estado" style="background:${bg};color:${color};">${dot} ${estado}</span>`;
    };
    const mesasMap = mesasConfiguradas.map(m => {
      const pedido = ocupados[m.nombre];
      const estado = pedido ? (pedido.estadoMesa || m.estado || 'Ocupada') : (m.estado || 'Disponible');
      const card = pedido ? `<div class="lugar-card ocupada" data-action="ver-pedido" data-pedidoid="${this.escapeHtml(pedido.id)}"><div class="lugar-icon">🍽️</div><div class="lugar-nombre">${this.escapeHtml(m.nombre)}</div>${badge(estado)}<div class="lugar-cliente">${this.escapeHtml(pedido.cliente || 'Sin cliente')} · ${m.capacidad} pax</div><div class="lugar-total">${this.fmt(pedido.total)}</div>${pedido.saldo > 0 && pedido.totalPagado > 0 ? `<div class="lugar-saldo">Abonado ${this.fmt(pedido.totalPagado)} · Saldo ${this.fmt(pedido.saldo)}</div>` : ''}</div>` : `<div class="lugar-card libre" data-action="nuevo-pedido" data-lugar="${this.escapeHtml(m.nombre)}"><div class="lugar-icon">🍽️</div><div class="lugar-nombre">${this.escapeHtml(m.nombre)}</div>${badge(estado)}<div class="lugar-cliente">${estado === 'Reservada' ? 'Reservada' : 'Disponible'} · ${m.capacidad} pax</div></div>`;
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


  verPedido(pedidoId, abrirMenu) {
    this.state.currentPedidoId = pedidoId;
    obtenerPedido(pedidoId).then(pedido => {
      if (!pedido) { this.showMessage('mesaMsg', 'Pedido no encontrado', 'error'); return; }
      const mesaView = document.getElementById('mesaView');
      const detail = document.getElementById('pedidoDetail');
      if (mesaView) mesaView.style.display = 'none';
      if (detail) detail.style.display = 'block';
      if (!detail) return;

      const cuentasEnItems = this.getCuentasDelPedido(pedido);
      const esSplit = cuentasEnItems.length > 0;
      const cerrado = pedido.estado !== 'Abierto';

      const itemsNoPagados = pedido.items.filter(i => !i.pagado);
      const itemsPagados = pedido.items.filter(i => i.pagado);
      const totalSinPagar = itemsNoPagados.reduce((s, i) => s + i.subtotal, 0);

      let itemsHtml = '';
      if (pedido.items && pedido.items.length) {
        const extraCol = !cerrado ? '40px' : '';
        itemsHtml = `<div class="items-list"><div class="item-row item-header" style="${extraCol ? `grid-template-columns:${extraCol} 1fr 60px 100px 100px 80px` : ''}">
          ${extraCol ? '<span style="text-align:center;">✓</span>' : ''}
          <span>Producto</span><span style="text-align:right;">Cant.</span><span style="text-align:right;">Precio</span><span style="text-align:right;">Subtotal</span><span style="text-align:center;">Acción</span>
        </div>`;
        pedido.items.forEach(item => {
          const isPagado = item.pagado;
          const cColor = item.cuenta ? this.getCuentaColor(item.cuenta) : null;
          const cuentaLabel = item.cuenta ? `<span style="font-size:0.75rem;padding:1px 8px;border-radius:10px;background:${cColor.bg};color:${cColor.text};margin-left:4px;">${this.getCuentaIcon(item.cuenta)} ${item.cuenta}</span>` : '';
          const cuentasDisponibles = [...new Set([...cuentasEnItems, ...this.state.cuentas])];
          const btnsAsignar = (item.cuenta || isPagado) ? '' : cuentasDisponibles.map(c =>
            `<button class="btn-icon" data-action="asignar-cuenta" data-detalleid="${item.id}" data-cuenta="${c}" title="Asignar a Cuenta ${c}" style="font-size:0.7rem;">${this.getCuentaIcon(c)}</button>`
          ).join('');
          const rowStyle = isPagado ? 'opacity:0.65;background:var(--success-bg) !important;' : '';
          itemsHtml += `<div class="item-row" style="${rowStyle}${extraCol ? `grid-template-columns:${extraCol} 1fr 60px 100px 100px 80px` : ''}">
            ${!cerrado && !isPagado ? `<span style="text-align:center;"><input type="checkbox" class="item-checkbox" data-detalleid="${item.id}" style="width:18px;height:18px;cursor:pointer;"></span>` : extraCol ? '<span></span>' : ''}
            <span class="item-nombre" style="${isPagado ? 'text-decoration:line-through;color:var(--success-text);' : ''}">${isPagado ? '✔ ' : ''}${this.escapeHtml(item.nombre)}${cuentaLabel}${item.notas ? '<br><small style="color:var(--text-muted);font-size:0.8rem;">📝 ' + this.escapeHtml(item.notas) + '</small>' : ''}${isPagado ? ' <span style="font-size:0.7rem;padding:1px 8px;border-radius:10px;background:var(--success);color:white;">Pagado</span>' : ''}</span>
            <span class="item-cantidad">${item.cantidad}</span>
            <span class="item-precio">${this.fmt(item.precioUnitario)}</span>
            <span class="item-subtotal">${this.fmt(item.subtotal)}</span>
            <span class="item-acciones">
              ${!isPagado ? `<button class="btn-icon" data-action="editar-producto" data-detalleid="${item.id}" title="Modificar">✏️</button>` : ''}
              ${!isPagado && !cerrado ? `<button class="btn-icon" data-action="eliminar-item" data-detalleid="${item.id}" title="Eliminar">🗑️</button>` : ''}
              ${!isPagado && !cerrado ? `<button class="btn-icon" data-action="pagar-item" data-detalleid="${item.id}" title="Pagar este item" style="font-size:0.85rem;">💳</button>` : ''}
              ${btnsAsignar}
            </span>
          </div>`;
        });
        itemsHtml += '</div>';

        // Multi-pagar bar
        if (!cerrado && itemsNoPagados.length > 1) {
          itemsHtml += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px;background:var(--primary-bg-light);border-radius:8px;">
            <span><strong id="selectedCount">0</strong> items seleccionados — Total: <strong id="selectedTotal">$0</strong></span>
            <button class="btn btn-success btn-sm" data-action="pagar-seleccionados" type="button" disabled id="btnPagarSeleccionados">💳 Pagar seleccionados</button>
          </div>`;
        }
      } else {
        itemsHtml = '<div class="message info" style="margin:15px 0;">No hay items en este pedido. Agregue usando el botón <strong>+ Agregar Item</strong>.</div>';
      }

      const totalGeneral = itemsNoPagados.filter(i => !i.cuenta).reduce((s, i) => s + i.subtotal, 0);
      const saldoRestante = totalSinPagar;

      let splitButtonsHtml = '';
      if (esSplit && !cerrado) {
        const rows = [];
        cuentasEnItems.forEach(cuenta => {
          const totalC = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => s + i.subtotal, 0);
          const pagosC = this.pagosDeCuenta(pedido, cuenta);
          const saldoC = totalC - pagosC;
          const cColor = this.getCuentaColor(cuenta);
          rows.push(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:${cColor.bg};border-radius:8px;margin-bottom:6px;border:1px solid color-mix(in srgb, ${cColor.text} 30%, transparent);">
            <span style="font-weight:600;">${this.getCuentaIcon(cuenta)} Cuenta ${cuenta}</span>
            <span>Total: ${this.fmt(totalC)}</span>
            ${pagosC > 0 ? `<span style="color:var(--success-text);">Acumulado: ${this.fmt(pagosC)}</span>` : ''}
            <span style="font-weight:700;color:${saldoC <= 0.01 ? 'var(--success-text)' : cColor.text};">Pendiente: ${this.fmt(Math.max(0, saldoC))}</span>
            ${saldoC > 0.01 ? `<span style="display:flex;gap:6px;"><button class="btn btn-sm" style="padding:6px 14px;font-size:0.85rem;background:transparent;border:1px solid ${cColor.text};color:${cColor.text};border-radius:6px;cursor:pointer;" data-action="abonar-cuenta" data-cuenta="${cuenta}" type="button">💰 Abonar</button><button class="btn" style="padding:6px 14px;font-size:0.85rem;background:${cColor.text};color:white;border:none;border-radius:6px;cursor:pointer;" data-action="cerrar-cuenta" data-cuenta="${cuenta}" type="button">🔒 Pagar ${this.fmt(saldoC)}</button></span>` : '<span style="color:var(--success);font-weight:700;">✔ Pagada</span>'}
          </div>`);
        });
        if (totalGeneral > 0) {
          rows.push(`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--primary-bg-light);border-radius:8px;margin-bottom:6px;border:1px solid var(--primary-border);">
            <span style="font-weight:600;">📋 General</span>
            <span>Total: ${this.fmt(totalGeneral)}</span>
            <span style="font-weight:700;color:var(--primary-dark);">Saldo: ${this.fmt(totalGeneral)}</span>
            <button class="btn btn-outline" style="padding:6px 14px;font-size:0.85rem;" data-action="cerrar-cuenta-general" type="button">🔒 Pagar ${this.fmt(totalGeneral)}</button>
          </div>`);
        }
        rows.push(`<div style="text-align:center;margin-top:8px;"><button class="btn btn-sm" style="background:transparent;border:1px dashed var(--text-muted);color:var(--text-muted);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;" data-action="agregar-cuenta" type="button">➕ Agregar Cuenta</button></div>`);
        if (rows.length) splitButtonsHtml = `<div style="margin-top:10px;">${rows.join('')}</div>`;
      }

      // Show pagos history if any
      let pagosHtml = '';
      if (pedido.pagos && pedido.pagos.length) {
        pagosHtml = `<div style="margin:10px 0;padding:10px;background:var(--primary-bg-light);border-radius:8px;font-size:0.85rem;">
          <div style="font-weight:600;margin-bottom:6px;color:var(--primary-dark);">📋 Pagos registrados</div>
          ${pedido.pagos.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--primary-border);">
            <span>${p.metodoPago}${p.itemNombre ? ` <span style="color:var(--text-muted);font-size:0.8rem;">(${this.escapeHtml(p.itemNombre)})</span>` : ''}${p.cuenta ? `<br><small style="color:var(--text-muted);">Cuenta ${p.cuenta}</small>` : ''}</span>
            <strong>${this.fmt(p.monto)}</strong>
          </div>`).join('')}
        </div>`;
      }

      detail.innerHTML = `<div class="card"><div class="card-header"><div class="pedido-header"><div>
        <h3>${this.escapeHtml(pedido.lugar)} — ${this.escapeHtml(pedido.id)}</h3>
        <div class="pedido-meta">
          <span class="pedido-meta-item">👤 ${pedido.cliente ? this.escapeHtml(pedido.cliente) : 'Sin cliente'}</span>
          <span class="pedido-meta-item">📅 ${pedido.fechaCreacion} · 🕐 ${pedido.horaCreacion || ''}</span>
          ${pedido.vendedor ? `<span class="pedido-meta-item">🧑‍🍳 ${this.escapeHtml(pedido.vendedor)}</span>` : ''}
          <span class="pedido-meta-item">${this.badgeEstado(pedido.estado)}</span>
        </div>${pedido.notas ? '<div class="pedido-notas">📝 ' + this.escapeHtml(pedido.notas) + '</div>' : ''}
      </div></div></div><div class="card-body">
        ${itemsHtml}
        ${pagosHtml}
        <div class="pedido-total-box">Total: ${this.fmt(pedido.total)}${pedido.totalPagado > 0 ? ` <span style="font-size:0.9rem;opacity:0.85;">| Acumulado: ${this.fmt(pedido.totalPagado)}</span>` : ''} ${itemsPagados.length > 0 || pedido.totalPagado > 0 ? `<span style="font-size:0.9rem;opacity:0.7;"> | Pendiente: ${this.fmt(pedido.saldoRestante)}</span>` : ''}</div>
        <div class="actions" style="margin-bottom:0;">
          ${!cerrado ? `
            <button class="btn btn-success" data-action="agregar-item" type="button">➕ Agregar Item</button>
            <button class="btn btn-info" data-action="activar-split" type="button">✂️ Dividir Cuenta</button>
            <button class="btn btn-secondary" data-action="imprimir-comanda" data-pedidoid="${pedido.id}" type="button">🍽️ Comanda</button>
            <button class="btn btn-danger" data-action="cancelar-pedido" type="button">🛑 Cancelar Pedido</button>
            ${!esSplit ? `${pedido.saldoRestante > 0.01 ? `<button class="btn btn-outline" data-action="abonar-general" type="button">💰 Abonar</button>` : ''}<button class="btn btn-warning" data-action="cerrar-pedido" type="button">🔒 Cerrar Pedido (${this.fmt(saldoRestante)})</button>` : ''}`
          : `<button class="btn btn-info" data-action="descargar-factura" data-pedidoid="${pedido.id}" type="button">🖨️ Ver Ticket / Factura</button>`}
          ${splitButtonsHtml}
          ${!cerrado ? `<button class="btn btn-outline" data-action="editar-pedido" type="button">✏️ Editar</button>` : ''}
          <button class="btn btn-secondary" data-action="volver-mesas" type="button">← Volver</button>
        </div>
      </div></div>`;

      // Checkbox update handler
      const cbs = detail.querySelectorAll('.item-checkbox');
      cbs.forEach(cb => {
        cb.addEventListener('change', () => {
          const checked = detail.querySelectorAll('.item-checkbox:checked');
          const total = Array.from(checked).reduce((s, c) => {
            const item = pedido.items.find(i => i.id == c.dataset.detalleid);
            return s + (item ? item.subtotal : 0);
          }, 0);
          const countEl = document.getElementById('selectedCount');
          const totalEl = document.getElementById('selectedTotal');
          const btnEl = document.getElementById('btnPagarSeleccionados');
          if (countEl) countEl.textContent = checked.length;
          if (totalEl) totalEl.textContent = this.fmt(total);
          if (btnEl) btnEl.disabled = checked.length === 0;
        });
      });

      if (abrirMenu && !cerrado) setTimeout(() => this.mostrarMenuProductos(), 300);
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  mostrarMenuProductos() {
    this.cerrarModal();
    obtenerProductos().then(productos => {
      this.state.productosConPrecio = productos;
      const grupos = [...new Set(productos.map(p => p.grupo))];
      let menuHtml = '';
      grupos.forEach(grupo => {
        const prods = productos.filter(p => p.grupo === grupo);
        menuHtml += `<div style="margin-bottom:18px;"><h4 style="color:var(--primary-dark);margin-bottom:8px;font-size:0.95rem;border-bottom:1px solid var(--primary-border);padding-bottom:5px;">📂 ${this.escapeHtml(grupo)}</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
          ${prods.map(p => `<div style="background:var(--primary-bg-light);border-radius:8px;padding:10px;cursor:pointer;text-align:center;transition:all 0.15s;border:1px solid transparent;" data-action="seleccionar-producto-menu" data-codigo="${this.escapeHtml(p.codigo)}" data-nombre="${this.escapeHtml(p.nombre)}" data-precio="${p.precio}">
            <div style="font-weight:600;font-size:0.9rem;">${this.escapeHtml(p.nombre)}</div>
            <div style="color:var(--text-muted);font-size:0.8rem;">${this.fmt(p.precio)}</div>
          </div>`).join('')}</div></div>`;
      });

      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:20px;max-width:650px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h3 style="color:var(--primary);">📋 Menú — seleccione un producto</h3>
          <button class="btn btn-secondary" data-action="cerrar-modal" style="padding:6px 14px;font-size:0.85rem;" type="button">Cerrar</button>
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
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);" data-codigo="${this.escapeHtml(codigo)}">
      <h3 style="color:var(--primary);margin-bottom:5px;">${this.escapeHtml(nombre)}</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:20px;">Precio base: <strong>${this.fmt(precioBase)}</strong></p>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;">
        <div class="form-group"><label for="cantMenu">Cantidad</label><input id="cantMenu" type="number" min="0.01" step="1" value="1" required></div>
        <div class="form-group"><label for="precioMenu">Precio Unitario <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem;">(modificable)</span></label>
          <input id="precioMenu" type="number" min="0" step="0.01" value="${precioBase}" style="border-color:var(--warning);font-weight:600;"></div>
      </div>
      <div class="form-group" style="margin-bottom:15px;"><label for="notasMenu">Notas</label><input id="notasMenu" type="text" placeholder="Ej: sin hielo, bien tostado"></div>
      <div style="margin-bottom:15px;text-align:center;font-size:1.2rem;color:var(--primary-dark);font-weight:700;">Subtotal: <span id="previewSubtotal">${this.fmt(precioBase)}</span></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="guardar-item-menu" type="button" style="flex:1;">Agregar al Pedido</button>
        <button class="btn btn-secondary" data-action="cancelar-item-form" type="button">Cancelar</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    const upd = () => {
      const c = parseFloat(document.getElementById('cantMenu')?.value) || 0;
      const p = parseFloat(document.getElementById('precioMenu')?.value) || 0;
      document.getElementById('previewSubtotal').textContent = App.fmt(c * p);
    };
    document.getElementById('cantMenu')?.addEventListener('input', upd);
    document.getElementById('precioMenu')?.addEventListener('input', upd);
  },


  guardarItemMenu() {
    const modal = document.querySelector('.modal-backdrop');
    const codigo = modal?.querySelector('[data-codigo]')?.dataset.codigo;
    const cantidad = parseFloat(document.getElementById('cantMenu')?.value);
    const precioUnitario = parseFloat(document.getElementById('precioMenu')?.value);
    const notas = document.getElementById('notasMenu')?.value?.trim() || '';
    const pedidoId = this.state.currentPedidoId;
    const prod = this.state.productosConPrecio.find(p => p.codigo === codigo);
    if (!codigo || !cantidad || !precioUnitario) { this.showMessage('mesaMsg', 'Complete cantidad y precio', 'error'); return; }
    if (!pedidoId) { this.showMessage('mesaMsg', 'No hay pedido activo', 'error'); return; }
    agregarItemPedido(pedidoId, { codigo, nombre: prod ? prod.nombre : '', cantidad, precioUnitario, notas })
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
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="color:var(--primary);margin-bottom:20px;">Modificar Item</h3>
        <p style="color:var(--text-muted);margin-bottom:15px;">${this.escapeHtml(item.nombre)}</p>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label for="editCantMenu">Cantidad</label><input id="editCantMenu" type="number" min="0.01" step="1" value="${item.cantidad}"></div>
          <div class="form-group"><label for="editPrecioMenu">Precio Unitario</label><input id="editPrecioMenu" type="number" min="0" step="0.01" value="${item.precioUnitario}"></div>
        </div>
        <div class="form-group" style="margin-bottom:15px;"><label for="editNotasMenu">Notas</label><input id="editNotasMenu" type="text" value="${this.escapeHtml(item.notas)}"></div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-success" data-action="guardar-mod-item" data-detalleid="${item.id}" type="button">Guardar</button>
          <button class="btn btn-secondary" data-action="cancelar-item-form" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  guardarModItem(detalleId) {
    const cantidad = parseFloat(document.getElementById('editCantMenu')?.value);
    const precioUnitario = parseFloat(document.getElementById('editPrecioMenu')?.value);
    const notas = document.getElementById('editNotasMenu')?.value?.trim() || '';
    if (!cantidad || !precioUnitario) { this.showMessage('mesaMsg', 'Complete cantidad y precio', 'error'); return; }
    modificarItemPedido(detalleId, { cantidad, precioUnitario, notas })
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
      const totalPagado = (pedido.pagos || []).reduce((s, p) => s + p.monto, 0);
      const saldo = pedido.total - totalPagado;
      if (saldo <= 0) { this.showMessage('mesaMsg', 'El pedido ya está totalmente pagado', 'warning'); return; }
      this.cerrarModal();
      this.mostrarModalPago({
        total: saldo,
        titulo: '🔒 Cerrar Pedido',
        onConfirm: (pagos, cambio) => this.procesarCierre(pagos, cambio)
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },


  confirmarCancelarPedido() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId || !confirm('¿Cancelar este pedido y liberar la mesa? La información se conservará en el historial.')) return;
    const motivo = prompt('Motivo de cancelación:', 'Cancelado por colaborador');
    if (motivo === null) return;
    cancelarPedido(pedidoId, motivo.trim() || 'Cancelado por colaborador')
      .then(res => { this.state.currentPedidoId = null; this.showMessage('mesaMsg', res.mensaje, 'success'); this.cargarVistaMesas(); })
      .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
  },


  obtenerTotalActual() {
    const el = document.querySelector('.pedido-total-box');
    if (!el) return 0;
    const text = el.textContent;
    const m = text.match(/([\d,.]+)/);
    if (!m) return 0;
    return parseFloat(m[0].replace(/\./g, '').replace(',', '.')) || 0;
  },


  procesarCierre(pagos, cambio) {
    const totalNum = pagos.reduce((s, p) => s + p.monto, 0);
    const metodosStr = pagos.map(p => `${p.metodoPago}: ${this.fmt(p.monto)}`).join(', ');
    if (!confirm(`¿Confirmar cierre del pedido por ${this.fmt(totalNum)}?\n\n${metodosStr}\n\nSe descontará el stock de los productos.`)) return;
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
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
        this.cargarVistaMesas();
      })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
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
    obtenerPedido(pedidoId).then(pedido => {
      const sinCuenta = pedido.items.filter(i => !i.cuenta);
      if (!sinCuenta.length) return;
      const cuentas = this.state.cuentas.length >= 2 ? this.state.cuentas : ['A', 'B'];
      const promises = sinCuenta.map((item, idx) => {
        const cuenta = cuentas[idx % cuentas.length];
        return modificarItemPedido(item.id, {
          cantidad: item.cantidad, precioUnitario: item.precioUnitario,
          notas: item.notas, cuenta
        });
      });
      Promise.all(promises).then(() => {
        this.showMessage('mesaMsg', `Items distribuidos entre cuentas: ${cuentas.join(', ')}`, 'success');
        this.verPedido(pedidoId);
      }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
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
      this.showMessage('mesaMsg', `Cuenta ${nueva} agregada. Asigne items usando los botones.`, 'success');
      this.verPedido(pedidoId);
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
      const totalCuenta = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => s + i.subtotal, 0);
      if (totalCuenta <= 0) { this.showMessage('mesaMsg', 'Cuenta ' + cuenta + ' no tiene items', 'error'); return; }
      this.mostrarModalPago({
        total: totalCuenta,
        titulo: `🔒 Cerrar Cuenta ${cuenta}`,
        onConfirm: (pagos, cambio) => {
          cerrarCuentaPedido(pedidoId, cuenta, pagos, cambio)
            .then(res => { this._openPdf(res);
              this.showMessage('mesaMsg', res.mensaje, 'success');
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
        return s + (item ? item.subtotal : 0);
      }, 0);
      this.mostrarModalPago({
        total,
        titulo: `💳 Pagar ${detalleIds.length} items (${this.fmt(total)})`,
        detalleIds,
        onConfirm: (pagos, cambio) => {
          cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio)
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
    }).reduce((s, p) => s + p.monto, 0);
  },


  abonarCuentaUI(cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      let saldo;
      if (cuenta) {
        const totalC = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => s + i.subtotal, 0);
        saldo = totalC - this.pagosDeCuenta(pedido, cuenta);
      } else {
        saldo = pedido.saldoRestante;
      }
      if (!(saldo > 0)) { this.showMessage('mesaMsg', 'Sin saldo pendiente', 'error'); return; }
      this.mostrarModalAbono({
        saldo,
        titulo: cuenta ? `💰 Abonar a Cuenta ${cuenta}` : '💰 Abonar al pedido',
        onConfirm: (pagos) => {
          abonarCuenta(pedidoId, cuenta, pagos).then(res => {
            this.showMessage('mesaMsg', `${res.mensaje} Acumulado: ${this.fmt(res.acumulado)} · Pendiente: ${this.fmt(res.pendiente)}`, 'success');
            if (res.pedidoCerrado && window.Ticket) Ticket.mostrarModal(pedidoId);
            this.verPedido(pedidoId);
          }).catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
        }
      });
    }).catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
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
