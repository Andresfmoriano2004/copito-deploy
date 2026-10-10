// Copito POS — Item CRUD legacy (los flujos de cierre/cancelación/edición viven
// en js/controllers/pedidos_controller.js; aquí solo queda lo aún no migrado).
// Extends the global App facade. Loaded after mesas.js.
Object.assign(App, {

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
      <h3 style="color:var(--primary-strong);margin-bottom:5px;">${this.escapeHtml(nombre)}</h3>
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
        <h3 style="color:var(--primary-strong);margin-bottom:20px;">Modificar Item</h3>
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

});

if (typeof AppEventRouter !== 'undefined') {
  AppEventRouter.registerMany({
    'agregar-item': () => App.mostrarPosOrder(App.state.currentPedidoId || Store.get('pedidos.currentId')),
    'seleccionar-producto-menu': ({ button }) => App.seleccionarProductoMenu(button.dataset.codigo),
    'guardar-item-menu': () => App.guardarItemMenu(),
    'eliminar-item': ({ button }) => App.confirmarEliminarItem(button.dataset.detalleid),
    'editar-producto': ({ button }) => App.mostrarFormModificarItem(button.dataset.detalleid),
    'guardar-mod-item': ({ button }) => App.guardarModItem(button.dataset.detalleid),
    'cerrar-pedido': () => App.confirmarCerrarPedido(),
    'confirmar-cerrar-pedido': () => App.confirmarCerrarPedidoPago(),
    'cancelar-pedido': () => App.confirmarCancelarPedido(),
    'editar-pedido': () => App.mostrarFormEditarPedido(),
    'guardar-edicion-pedido': () => App.guardarEdicionPedido()
  });
}
