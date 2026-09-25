// Copito POS — Controller for split-screen POS.
// Mediates between PosView (templates) and API functions.
const PosController = {

  init() {
    Store.subscribe('pos', () => this._renderTicket());
  },

  async mostrarPosOrder(pedidoId) {
    const container = document.getElementById('pedidoDetail');
    if (!container) return;
    const mesaView = document.getElementById('mesaView');
    if (mesaView) mesaView.style.display = 'none';
    container.style.display = 'block';

    // Reset POS state
    Store.batch({
      'pos.pedidoId': pedidoId || null,
      'pos.cart': [],
      'pos.category': 'Todos',
      'pos.pedidoData': null,
      'pos.splitMode': false,
      'pos.cuentas': ['A', 'B'],
      'pos.originalDetalleIds': []
    });

    try {
      const productos = await apiGet('/productos');
      Store.set('pos.productos', productos);
    } catch (e) {
      container.innerHTML = `<div class="pos-layout"><div class="pos-left" style="display:flex;align-items:center;justify-content:center;color:var(--danger);">Error: ${e.message}</div></div>`;
      return;
    }

    if (pedidoId) {
      try {
        const pedido = await apiGet(`/pedidos/${pedidoId}`);
        Store.set('pos.pedidoData', pedido);
        if (pedido && pedido.items) {
          const cart = pedido.items.filter(i => !i.pagado).map(i => ({
            codigo: i.codigo || i.nombre,
            nombre: i.nombre,
            precio: i.precioUnitario,
            cant: i.cantidad,
            notas: i.notas || '',
            cuenta: i.cuenta || null,
            detalleId: i.id
          }));
          Store.set('pos.cart', cart);
          Store.set('pos.originalDetalleIds', pedido.items.filter(i => !i.pagado).map(i => i.id));
          if (pedido.cuentasActivas && pedido.cuentasActivas.length > 1) {
            Store.set('pos.cuentas', pedido.cuentasActivas);
            Store.set('pos.splitMode', true);
          }
        }
      } catch (e) { /* ignore */ }
    }

    container.innerHTML = PosView.layout({ pedidoId, ...Store.get('pos.pedidoData') });
    this._renderCats();
    this._renderProducts();
    this._renderTicket();
    this._bindSearch();
    this._bindEvents();
  },

  _bindSearch() {
    const inp = document.getElementById('posSearch');
    if (inp && !inp._b) {
      inp._b = true;
      inp.addEventListener('input', () => { this._renderProducts(); });
    }
  },

  _bindEvents() {
    const container = document.getElementById('pedidoDetail');
    if (!container || container._posCtrlBound) return;
    container._posCtrlBound = true;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'pos-add') { this._posAdd(btn.dataset.codigo); return; }
      if (action === 'pos-qty') { this._posQty(btn.dataset.codigo, btn.dataset.d); return; }
      if (action === 'pos-cat') { this._posSetCat(btn.dataset.cat); return; }
      if (action === 'pos-cobrar') { this._posCobrar(); return; }
      if (action === 'pos-cobrar-cuenta') { this._posCobrarCuenta(btn.dataset.cuenta); return; }
      if (action === 'pos-split') { this._posSplit(); return; }
      if (action === 'pos-split-exit') { this._posSplitExit(); return; }
      if (action === 'pos-split-assign') { this._posSplitAssign(parseInt(btn.dataset.idx), btn.dataset.cuenta); return; }
      if (action === 'pos-cancelar') { this._posCancelar(); return; }
      if (action === 'pos-cancelar-pedido') { this._posCancelarPedido(); return; }
      if (action === 'pos-editar-pedido') { this._posEditarPedido(); return; }
      if (action === 'pos-comanda') { this._posComanda(); return; }
      if (action === 'pos-volver-detalle') { this._posVolverDetalle(); return; }
      if (action === 'volver-mesas') { e.stopPropagation(); this._posVolverMesas(); return; }
      if (action === 'descargar-factura') { e.stopPropagation(); descargarPDFPedido(btn.dataset.pedidoid); return; }
      if (action === 'pos-toggle-pagos') {
        const list = document.getElementById('posPagosList');
        if (list) list.style.display = list.style.display === 'none' ? 'block' : 'none';
        return;
      }
    });
  },

  // ─── Render helpers ────────────────────────────────
  _renderCats() {
    const el = document.getElementById('posCats');
    if (!el) return;
    el.innerHTML = PosView.categories(Store.get('pos.productos'), Store.get('pos.category'));
  },

  _renderProducts() {
    const el = document.getElementById('posGrid');
    if (!el) return;
    const q = (document.getElementById('posSearch')?.value || '').toLowerCase().trim();
    el.innerHTML = PosView.products(Store.get('pos.productos'), Store.get('pos.category'), Store.get('pos.cart'), q);
  },

  _renderTicket() {
    const cart = Store.get('pos.cart');
    const splitMode = Store.get('pos.splitMode');
    const cuentas = Store.get('pos.cuentas');
    const pedidoId = Store.get('pos.pedidoId');
    const pedidoData = Store.get('pos.pedidoData');

    const itemsEl = document.getElementById('posTicketBody');
    if (itemsEl) itemsEl.innerHTML = PosView.ticketItems(cart, splitMode, cuentas);

    const summaryEl = document.getElementById('posSummary');
    if (summaryEl) summaryEl.innerHTML = PosView.summary(cart, splitMode, cuentas);

    const actionsEl = document.getElementById('posActions');
    if (actionsEl) actionsEl.innerHTML = PosView.actions(cart, pedidoId, pedidoData, splitMode, cuentas);
  },

  // ─── Cart mutations ────────────────────────────────
  _posAdd(codigo) {
    const productos = Store.get('pos.productos');
    const cart = [...Store.get('pos.cart')];
    const p = productos.find(x => x.codigo === codigo);
    if (!p || (p.stockActual || 0) <= 0) return;
    const ex = cart.find(i => i.codigo === codigo);
    if (ex) { ex.cant += 1; }
    else { cart.push({ codigo: p.codigo, nombre: p.nombre, precio: p.precio, cant: 1, notas: '' }); }
    Store.set('pos.cart', cart);
    this._renderProducts();
    this._renderCats();
  },

  _posQty(codigo, delta) {
    const cart = [...Store.get('pos.cart')];
    const it = cart.find(i => i.codigo === codigo);
    if (!it) return;
    const d = parseInt(delta, 10) || 0;
    it.cant += d;
    const newCart = it.cant <= 0 ? cart.filter(i => i.codigo !== codigo) : cart;
    Store.set('pos.cart', newCart);
    this._renderProducts();
    this._renderCats();
  },

  _posSetCat(cat) {
    Store.set('pos.category', cat);
    this._renderCats();
    this._renderProducts();
  },

  async _posCancelar() {
    if (!Store.get('pos.cart').length) return;
    if (!confirm('¿Vaciar el carrito? Se borrarán los items no cobrados.')) return;
    const pid = Store.get('pos.pedidoId');
    if (pid) {
      const cart = Store.get('pos.cart');
      for (const i of cart) {
        if (i.detalleId) {
          try { await apiDelete(`/pedidos/items/${i.detalleId}`); } catch (e) {}
        }
      }
    }
    Store.batch({ 'pos.cart': [], 'pos.originalDetalleIds': [] });
    this._renderProducts();
    this._renderCats();
  },

  // ─── Payment ───────────────────────────────────────
  async _posCobrar() {
    if (!Store.get('pos.cart').length) return;
    try { await this._posSyncCart(); } catch (e) { alert('Error guardando items: ' + e.message); return; }

    App.mostrarModalPago({
      total: this._subtotal(),
      titulo: '💳 Cobrar Pedido',
      onConfirm: (pagos, cambio) => {
        cerrarPedido(Store.get('pos.pedidoId'), pagos, cambio)
          .then(res => {
            App.cerrarModal();
            App.showMessage('mesaMsg', res.mensaje, 'success');
            if (window.Ticket) Ticket.mostrarModal(Store.get('pos.pedidoId'), { cambio });
            Store.batch({ 'pos.cart': [], 'pos.pedidoId': null });
            PedidosController.cargarVistaMesas();
          })
          .catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
      }
    });
  },

  async _posCobrarCuenta(cuenta) {
    const cart = Store.get('pos.cart');
    const cTotal = cart.filter(i => (i.cuenta || 'A') === cuenta).reduce((s, i) => App.roundMoney(s + (i.precio * i.cant)), 0);
    if (cTotal <= 0) return;
    try { await this._posSyncCart(); } catch (e) { alert('Error: ' + e.message); return; }

    App.mostrarModalPago({
      total: cTotal,
      titulo: `💰 Cobrar Cuenta ${cuenta}`,
      onConfirm: (pagos, cambio) => {
        cerrarCuentaPedido(Store.get('pos.pedidoId'), cuenta, pagos, cambio)
          .then(res => {
            App.cerrarModal();
            App.showMessage('mesaMsg', res.mensaje, 'success');
            if (res.pdf) App._openPdf(res);
            this.mostrarPosOrder(Store.get('pos.pedidoId'));
          })
          .catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
      }
    });
  },

  async _posSyncCart() {
    let pid = Store.get('pos.pedidoId');
    const cart = Store.get('pos.cart');
    if (!pid) {
      const res = await apiPost('/pedidos', { lugar: App.LUGARES[0]?.id || 'Barra 1', cliente: '' });
      pid = res.pedidoId;
      Store.set('pos.pedidoId', pid);
    }
    const splitMode = Store.get('pos.splitMode');
    const cuentas = Store.get('pos.cuentas');
    if (splitMode && cart.some(i => i.cuenta)) {
      await apiPut(`/pedidos/${pid}`, { cuentasActivas: cuentas });
    }
    const originalIds = Store.get('pos.originalDetalleIds');
    const newCart = cart.map(i => ({ ...i }));
    for (let idx = 0; idx < newCart.length; idx++) {
      const i = newCart[idx];
      if (i.detalleId) {
        await apiPut(`/pedidos/items/${i.detalleId}`, { cantidad: i.cant, precioUnitario: i.precio, notas: i.notas, cuenta: i.cuenta || null });
      } else {
        const res = await apiPost(`/pedidos/${pid}/items`, { codigo: i.codigo, nombre: i.nombre, cantidad: i.cant, precioUnitario: i.precio, notas: i.notas, cuenta: i.cuenta || null });
        newCart[idx] = { ...i, detalleId: res.detalleId || res.id };
      }
    }
    Store.set('pos.cart', newCart);
    for (const origId of originalIds) {
      if (!newCart.find(i => i.detalleId === origId)) {
        try { await apiDelete(`/pedidos/items/${origId}`); } catch (e) {}
      }
    }
    Store.set('pos.originalDetalleIds', newCart.filter(i => i.detalleId).map(i => i.detalleId));
  },

  _subtotal() {
    return Store.get('pos.cart').reduce((s, i) => App.roundMoney(s + (i.precio * i.cant)), 0);
  },

  // ─── Split bill ────────────────────────────────────
  _posSplit() {
    Store.set('pos.splitMode', true);
    const cart = Store.get('pos.cart').map(i => ({ ...i }));
    const cuentas = Store.get('pos.cuentas');
    cart.forEach((item, idx) => {
      if (!item.cuenta) item.cuenta = cuentas[idx % cuentas.length];
    });
    Store.set('pos.cart', cart);
    this._renderCats();
  },

  _posSplitExit() {
    Store.set('pos.splitMode', false);
  },

  _posSplitAssign(idx, cuenta) {
    const cart = Store.get('pos.cart').map(i => ({ ...i }));
    if (cart[idx]) {
      cart[idx].cuenta = cuenta;
      Store.set('pos.cart', cart);
      this._renderCats();
    }
  },

  // ─── Order management ──────────────────────────────
  async _posCancelarPedido() {
    const pid = Store.get('pos.pedidoId');
    if (!pid) return;
    if (!confirm('¿Cancelar este pedido y liberar la mesa?')) return;
    const motivo = prompt('Motivo de cancelación:', '');
    if (motivo === null) return;
    try {
      await cancelarPedido(pid, motivo.trim() || 'Cancelado');
      Store.batch({ 'pos.cart': [], 'pos.pedidoId': null, 'pos.pedidoData': null });
      PedidosController.cargarVistaMesas();
    } catch (err) { alert('Error: ' + err.message); }
  },

  async _posEditarPedido() {
    const pid = Store.get('pos.pedidoId');
    if (!pid) return;
    PedidosController.mostrarFormEditarPedido();
  },

  async _posComanda() {
    if (!Store.get('pos.cart').length) return;
    try { await this._posSyncCart(); } catch (e) { alert('Error guardando items: ' + e.message); return; }
    const pid = Store.get('pos.pedidoId');
    if (pid && window.Ticket) Ticket.mostrarModal(pid, { tipo: 'comanda' });
  },

  async _posVolverMesas() {
    const cart = Store.get('pos.cart') || [];
    const needsSync = cart.length > 0 && cart.some(i => !i.detalleId);
    if (needsSync) {
      try {
        await this._posSyncCart();
        App.showMessage('mesaMsg', 'Comanda guardada en la mesa', 'success');
      } catch (e) {
        if (!confirm('No se pudieron guardar los items (' + e.message + '). ¿Salir de todas formas? Se perderán los cambios.')) return;
      }
    }
    if (typeof PedidosController !== 'undefined') PedidosController.cargarVistaMesas();
    else App.cargarVistaMesas();
  },

  async _posVolverDetalle() {
    const pid = Store.get('pos.pedidoId');
    const cart = Store.get('pos.cart') || [];
    if (pid && cart.length > 0 && cart.some(i => !i.detalleId)) {
      try {
        await this._posSyncCart();
      } catch (e) {
        if (!confirm('No se pudieron guardar los items (' + e.message + '). ¿Recargar de todas formas? Se perderán los cambios.')) return;
      }
    }
    if (typeof PedidosController !== 'undefined') {
      if (pid) { PedidosController.verPedido(pid); }
      else { PedidosController.cargarVistaMesas(); }
    } else if (pid) { App.mostrarPosOrder(pid); }
    else { App.cargarVistaMesas(); }
  }
};
