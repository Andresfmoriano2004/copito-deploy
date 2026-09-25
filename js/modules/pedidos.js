// Copito POS — Item CRUD, order management, and payment flows.
// Extends the global App facade. Loaded after mesas.js.
Object.assign(App, {

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
            b.style.border = '2px solid var(--border)'; b.style.background = 'transparent';
            b.style.color = 'var(--text-muted)'; b.style.fontWeight = '500';
          });
          btn.classList.add('active');
          const cc = this.getCuentaColor(btn.dataset.cuenta);
          btn.style.border = `2px solid ${cc.text}`; btn.style.background = cc.bg;
          btn.style.color = cc.text; btn.style.fontWeight = '700';
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
      this.state._editingItemCuenta = item.cuenta || null;
      const esSplit = this.state.currentCuentasPedido.length > 0;
      const cuentas = this.state.currentCuentasPedido;
      const cuentaActual = item.cuenta || this.state.currentCuentaSeleccionada || (cuentas[0] || 'A');
      let accountHtml = '';
      if (esSplit) {
        accountHtml = `<div class="form-group" style="grid-column:span 2;"><label>Cuenta</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${cuentas.map(c => {
            const color = this.getCuentaColor(c); const active = c === cuentaActual;
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
              b.classList.remove('active'); const bc = this.getCuentaColor(b.dataset.cuenta);
              b.style.border = '2px solid var(--border)'; b.style.background = 'transparent';
              b.style.color = 'var(--text-muted)'; b.style.fontWeight = '500';
            });
            btn.classList.add('active'); const cc = this.getCuentaColor(btn.dataset.cuenta);
            btn.style.border = `2px solid ${cc.text}`; btn.style.background = cc.bg;
            btn.style.color = cc.text; btn.style.fontWeight = '700';
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
    const propina = parseFloat(document.getElementById('propinaInputPrev')?.value) || 0;
    if (propina < 0) { this.showMessage('mesaMsg', 'La propina no puede ser negativa', 'error'); return; }
    obtenerPedido(pedidoId).then(pedido => {
      const totalPagado = (pedido.pagos || []).reduce((s, p) => App.sumMoney(s, p.monto), 0);
      const saldo = App.subMoney(pedido.total, totalPagado);
      this.cerrarModal();
      this.mostrarModalPago({
        total: saldo,
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
        this.showMessage('mesaMsg', 'El motivo es obligatorio cuando hay pagos registrados', 'error'); return;
      }
      cancelarPedido(pedidoId, motivo.trim() || 'Cancelado por colaborador')
        .then(res => { this.state.currentPedidoId = null; this.showMessage('mesaMsg', res.mensaje, 'success'); this.cargarVistaMesas(); })
        .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
    }).catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
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
    cerrarPedido(pedidoId, pagos, cambio)
      .then(res => {
        this.showMessage('mesaMsg', res.mensaje, 'success');
        this.state.currentPedidoId = null;
        if (res.pdf) { this._openPdf(res); }
        else if (window.Ticket) { Ticket.mostrarModal(pedidoId, { cambio }); }
        else { descargarPDFPedido(pedidoId); }
        if (propina > 0) { this.mostrarModalPropina(pedidoId, lugar); }
        else { this.cargarVistaMesas(); }
      })
      .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

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
