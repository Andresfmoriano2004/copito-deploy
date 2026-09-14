// ─── Split-Screen POS Order Component ──────────────────
// 2-column layout: Products (left) + Active Ticket (right)
// No modals — direct add-to-cart with +/- quantity controls.
Object.assign(App, {

  // ═══ STATE ═══════════════════════════════════════════
  _pos: {
    cart: [],
    category: 'Todos',
    productos: [],
    pedidoId: null,
    pedidoData: null,
    splitMode: false,
    cuentas: ['A', 'B'],
    originalDetalleIds: []
  },

  _posSubtotal() {
    return this._pos.cart.reduce((s, i) => this.roundMoney(s + (i.precio * i.cant)), 0);
  },
  _posItemCount() {
    return this._pos.cart.reduce((s, i) => s + i.cant, 0);
  },

  // ═══ ENTRY POINT ═════════════════════════════════════
  async mostrarPosOrder(pedidoId) {
    const container = document.getElementById('pedidoDetail');
    if (!container) return;
    const mesaView = document.getElementById('mesaView');
    if (mesaView) mesaView.style.display = 'none';
    container.style.display = 'block';

    this._pos.pedidoId = pedidoId || null;
    this._pos.cart = [];
    this._pos.category = 'Todos';
    this._pos.pedidoData = null;
    this._pos.splitMode = false;
    this._pos.cuentas = ['A', 'B'];
    this._pos.originalDetalleIds = [];

    try {
      this._pos.productos = await apiGet('/productos');
    } catch(e) {
      container.innerHTML = `<div class="pos-layout"><div class="pos-left" style="display:flex;align-items:center;justify-content:center;color:var(--danger);">Error: ${e.message}</div></div>`;
      return;
    }

    if (pedidoId) {
      try {
        const pedido = await apiGet(`/pedidos/${pedidoId}`);
        this._pos.pedidoData = pedido;
        if (pedido && pedido.items) {
          this._pos.cart = pedido.items.filter(i => !i.pagado).map(i => ({
            codigo: i.codigo || i.nombre,
            nombre: i.nombre,
            precio: i.precioUnitario,
            cant: i.cantidad,
            notas: i.notas || '',
            cuenta: i.cuenta || null,
            detalleId: i.id
          }));
          this._pos.originalDetalleIds = pedido.items.filter(i => !i.pagado).map(i => i.id);
          if (pedido.cuentasActivas && pedido.cuentasActivas.length > 1) {
            this._pos.cuentas = pedido.cuentasActivas;
            this._pos.splitMode = true;
          }
        }
      } catch(e) {}
    }

    container.innerHTML = this._posLayout();
    this._posRenderCats();
    this._posRenderProducts();
    this._posRenderTicket();
    this._posBindSearch();
  },

  // ═══ LAYOUT ══════════════════════════════════════════
  _posLayout() {
    const pid = this._pos.pedidoId || '';
    const pd = this._pos.pedidoData;
    const metaHtml = pd ? `<div class="pos-ticket-meta">
      <span>${this.escapeHtml(pd.lugar || '')}</span>
      ${pd.cliente ? `<span>👤 ${this.escapeHtml(pd.cliente)}</span>` : '<span>Sin cliente</span>'}
      <span>${pd.fechaCreacion || ''}</span>
      <span class="pos-ticket-estado ${pd.estado === 'Cerrado' ? 'cerrado' : 'abierto'}">${pd.estado || 'Abierto'}</span>
    </div>` : '';
    const pagosHtml = pd && pd.pagos && pd.pagos.length ? `<div class="pos-pagos-section" id="posPagosSection">
      <div class="pos-pagos-toggle" data-action="pos-toggle-pagos" type="button">📋 Pagos (${pd.pagos.length}) ▾</div>
      <div class="pos-pagos-list" id="posPagosList" style="display:none;">
        ${pd.pagos.map(p => `<div class="pos-pago-row">
          <span>${p.itemNombre ? '✔ ' + this.escapeHtml(p.itemNombre) : '💰 ' + (p.notas || 'Abono')} <small>${p.metodoPago || ''}</small></span>
          <strong>${this.fmt(p.monto)}</strong>
        </div>`).join('')}
      </div>
    </div>` : '';
    return `
    <div class="pos-layout">
      <div class="pos-col-left">
        <div class="pos-toolbar">
          <button class="pos-btn-back" data-action="pos-volver-detalle" type="button">← Volver</button>
          <h2 class="pos-toolbar-title">Menú</h2>
          <input type="text" id="posSearch" class="pos-search" placeholder="Buscar producto..." autocomplete="off">
        </div>
        <div class="pos-cats" id="posCats"></div>
        <div class="pos-grid" id="posGrid"></div>
      </div>
      <div class="pos-col-right">
        <div class="pos-ticket">
          <div class="pos-ticket-head">
            <span class="pos-ticket-label">Comanda</span>
            ${pid ? `<span class="pos-ticket-id">${pid}</span>` : ''}
          </div>
          ${metaHtml}
          ${pagosHtml}
          <div class="pos-ticket-body" id="posTicketBody"></div>
          <div class="pos-ticket-foot">
            <div class="pos-summary" id="posSummary"></div>
            <div class="pos-actions" id="posActions"></div>
            <button class="pos-link-back" data-action="volver-mesas" type="button">← Volver a Mesas</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // ═══ CATEGORIES ══════════════════════════════════════
  _posRenderCats() {
    const el = document.getElementById('posCats');
    if (!el) return;
    const prods = this._pos.productos;
    const grupos = [...new Set(prods.map(p => p.grupo).filter(Boolean))];
    const all = ['Todos', ...grupos];
    const active = this._pos.category;

    el.innerHTML = all.map(g => {
      const count = g === 'Todos' ? prods.length : prods.filter(p => p.grupo === g).length;
      return `<button class="pos-cat ${active === g ? 'active' : ''}"
        data-action="pos-cat" data-cat="${this.escapeHtml(g)}" type="button">
        ${this.escapeHtml(g)} <span class="pos-cat-n">${count}</span>
      </button>`;
    }).join('');
  },

  // ═══ PRODUCTS ════════════════════════════════════════
  _posRenderProducts() {
    const el = document.getElementById('posGrid');
    if (!el) return;
    const prods = this._pos.productos;
    const cat = this._pos.category;
    const q = (document.getElementById('posSearch')?.value || '').toLowerCase().trim();

    let list = cat === 'Todos' ? prods : prods.filter(p => p.grupo === cat);
    if (q) list = prods.filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));

    if (!list.length) {
      el.innerHTML = '<div class="pos-empty">No hay productos</div>';
      return;
    }

    el.innerHTML = list.map(p => {
      const agotado = (p.stockActual || 0) <= 0;
      const inCart = this._pos.cart.find(i => i.codigo === p.codigo);
      return `<button class="pos-card ${agotado ? 'agotado' : ''} ${inCart ? 'has-qty' : ''}"
        data-action="${agotado ? '' : 'pos-add'}" data-codigo="${this.escapeHtml(p.codigo)}"
        type="button" ${agotado ? 'disabled' : ''}>
        <span class="pos-card-name">${this.escapeHtml(p.nombre)}</span>
        <span class="pos-card-price">${this.fmt(p.precio)}</span>
        ${agotado ? '<span class="pos-card-tag">AGOTADO</span>' : ''}
        ${inCart ? `<span class="pos-card-qty">${inCart.cant}</span>` : ''}
      </button>`;
    }).join('');
  },

  _posBindSearch() {
    const inp = document.getElementById('posSearch');
    if (inp && !inp._b) {
      inp._b = true;
      inp.addEventListener('input', () => { this._posRenderProducts(); });
    }
  },

  // ═══ TICKET ══════════════════════════════════════════
  _posRenderTicket() {
    this._posRenderItems();
    this._posRenderSummary();
    this._posRenderActions();
  },

  _posRenderItems() {
    const el = document.getElementById('posTicketBody');
    if (!el) return;
    const items = this._pos.cart;

    if (!items.length) {
      el.innerHTML = `<div class="pos-empty-ticket">Sin productos.<br>Seleccione de la columna izquierda.</div>`;
      return;
    }

    const isSplit = this._pos.splitMode;

    if (isSplit) {
      const cuentas = this._pos.cuentas;
      let html = '';
      cuentas.forEach(c => {
        const cItems = items.filter(i => (i.cuenta || 'A') === c);
        if (!cItems.length) return;
        html += `<div class="pos-split-group">
          <div class="pos-split-group-header">Cuenta ${c}</div>
          ${cItems.map(i => this._posItemHtml(i, isSplit)).join('')}
        </div>`;
      });
      el.innerHTML = html;
    } else {
      el.innerHTML = items.map(i => this._posItemHtml(i, false)).join('');
    }
  },

  _posItemHtml(i, showCuenta) {
    const accBtns = showCuenta ? `<div class="pos-ti-acc">
      ${this._pos.cuentas.map(c => `<button class="pos-ti-acc-btn ${i.cuenta === c ? 'active acc-' + c.toLowerCase() : ''}" data-action="pos-split-assign" data-idx="${this._pos.cart.indexOf(i)}" data-cuenta="${c}" type="button">${c}</button>`).join('')}
    </div>` : '';
    return `
      <div class="pos-ti">
        <div class="pos-ti-top">
          <span class="pos-ti-name">${this.escapeHtml(i.nombre)}</span>
          <span class="pos-ti-price">${this.fmt(i.precio)}</span>
        </div>
        ${i.notas ? `<div class="pos-ti-notes">${this.escapeHtml(i.notas)}</div>` : ''}
        <div class="pos-ti-bottom">
          <div class="pos-qty">
            <button class="pos-q-btn minus" data-action="pos-qty" data-codigo="${i.codigo}" data-d="-1" type="button">−</button>
            <span class="pos-q-val">${i.cant}</span>
            <button class="pos-q-btn plus" data-action="pos-qty" data-codigo="${i.codigo}" data-d="1" type="button">+</button>
          </div>
          <span class="pos-ti-sub">${this.fmt(i.precio * i.cant)}</span>
          <button class="pos-ti-del" data-action="pos-qty" data-codigo="${i.codigo}" data-d="-${i.cant}" type="button">✕</button>
        </div>
        ${accBtns}
      </div>`;
  },

  _posRenderSummary() {
    const el = document.getElementById('posSummary');
    if (!el) return;
    const items = this._pos.cart;
    const n = this._posItemCount();
    const sub = this._posSubtotal();

    if (this._pos.splitMode) {
      const cuentas = this._pos.cuentas;
      let rows = '';
      cuentas.forEach(c => {
        const cTotal = items.filter(i => (i.cuenta || 'A') === c).reduce((s, i) => this.roundMoney(s + (i.precio * i.cant)), 0);
        if (cTotal > 0) rows += `<div class="pos-sum-row pos-sum-account"><span>Cuenta ${c}</span><span>${this.fmt(cTotal)}</span></div>`;
      });
      el.innerHTML = `
        <div class="pos-sum-row"><span>Productos</span><span>${n}</span></div>
        ${rows}
        <div class="pos-sum-total"><span>TOTAL</span><span>${this.fmt(sub)}</span></div>`;
    } else {
      el.innerHTML = `
        <div class="pos-sum-row"><span>Productos</span><span>${n}</span></div>
        <div class="pos-sum-row"><span>Subtotal</span><span>${this.fmt(sub)}</span></div>
        <div class="pos-sum-total"><span>TOTAL</span><span>${this.fmt(sub)}</span></div>`;
    }
  },

  _posRenderActions() {
    const el = document.getElementById('posActions');
    if (!el) return;
    const has = this._pos.cart.length > 0;
    const hasP = !!this._pos.pedidoId;
    const isSplit = this._pos.splitMode;
    const isClosed = this._pos.pedidoData && this._pos.pedidoData.estado !== 'Abierto';

    if (isSplit) {
      const items = this._pos.cart;
      const cuentasBtns = this._pos.cuentas.map(c => {
        const cTotal = items.filter(i => (i.cuenta || 'A') === c).reduce((s, i) => this.roundMoney(s + (i.precio * i.cant)), 0);
        if (cTotal <= 0) return '';
        return `<button class="pos-btn-primary pos-btn-split-cobrar" data-action="pos-cobrar-cuenta" data-cuenta="${c}" type="button">💰 Cobrar ${c} — ${this.fmt(cTotal)}</button>`;
      }).join('');

      el.innerHTML = `
        <div class="pos-split-cobrar-btns">${cuentasBtns}</div>
        <div class="pos-btn-row">
          <button class="pos-btn-outline" data-action="pos-split-exit" type="button">↩ Salir división</button>
          <button class="pos-btn-red" data-action="pos-cancelar" type="button">✕ Cancelar</button>
        </div>`;
    } else if (isClosed) {
      el.innerHTML = `
        <button class="pos-btn-primary" data-action="descargar-factura" data-pedidoid="${this._pos.pedidoId}" type="button">🖨️ Ver Ticket / Factura</button>
        <div class="pos-btn-row">
          <button class="pos-btn-outline" data-action="pos-comanda" type="button">🍽️ Comanda</button>
        </div>`;
    } else {
      el.innerHTML = `
        <button class="pos-btn-primary ${has ? '' : 'off'}" data-action="${has ? 'pos-cobrar' : ''}" type="button" ${has ? '' : 'disabled'}>💰 Cobrar${has ? ` (${this.fmt(this._posSubtotal())})` : ''}</button>
        <div class="pos-btn-row">
          <button class="pos-btn-outline" data-action="pos-comanda" type="button" ${hasP ? '' : 'disabled'}>🍽️ Comanda</button>
          <button class="pos-btn-outline" data-action="pos-split" type="button" ${has ? '' : 'disabled'}>✂️ Dividir</button>
          <button class="pos-btn-red" data-action="pos-cancelar" type="button" ${has ? '' : 'disabled'}>✕ Cancelar</button>
        </div>
        ${hasP ? `<div class="pos-btn-row" style="margin-top:4px;">
          <button class="pos-btn-outline" data-action="pos-editar-pedido" type="button">✏️ Editar</button>
          <button class="pos-btn-red" data-action="pos-cancelar-pedido" type="button" style="font-size:0.78rem;">🛑 Cancelar Pedido</button>
        </div>` : ''}`;
    }
  },

  // ═══ ACTIONS ═════════════════════════════════════════
  _posAdd(codigo) {
    const p = this._pos.productos.find(x => x.codigo === codigo);
    if (!p || (p.stockActual || 0) <= 0) return;
    const ex = this._pos.cart.find(i => i.codigo === codigo);
    if (ex) { ex.cant += 1; }
    else { this._pos.cart.push({ codigo: p.codigo, nombre: p.nombre, precio: p.precio, cant: 1, notas: '' }); }
    this._posRenderTicket();
    this._posRenderProducts();
    this._posRenderCats();
  },

  _posQty(codigo, delta) {
    const it = this._pos.cart.find(i => i.codigo === codigo);
    if (!it) return;
    it.cant += parseInt(delta);
    if (it.cant <= 0) this._pos.cart = this._pos.cart.filter(i => i.codigo !== codigo);
    this._posRenderTicket();
    this._posRenderProducts();
  },

  _posSetCat(cat) {
    this._pos.category = cat;
    this._posRenderCats();
    this._posRenderProducts();
  },

  _posCancelar() {
    if (!this._pos.cart.length) return;
    if (!confirm('¿Cancelar? Se perderán los items.')) return;
    this._pos.cart = [];
    this._posRenderTicket();
    this._posRenderProducts();
  },

  async _posCobrar() {
    if (!this._pos.cart.length) return;
    try { await this._posSyncCart(); } catch(e) { alert('Error guardando items: ' + e.message); return; }

    this.mostrarModalPago({
      total: this._posSubtotal(),
      titulo: '💳 Cobrar Pedido',
      onConfirm: (pagos, cambio) => {
        cerrarPedido(this._pos.pedidoId, pagos, cambio)
          .then(res => {
            this.cerrarModal();
            this.showMessage('mesaMsg', res.mensaje, 'success');
            if (window.Ticket) Ticket.mostrarModal(this._pos.pedidoId, { cambio });
            this._pos.cart = [];
            this._pos.pedidoId = null;
            this.cargarVistaMesas();
          })
          .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
      }
    });
  },

  // ═══ SYNC: save local cart to backend ══════════════
  async _posSyncCart() {
    let pid = this._pos.pedidoId;
    if (!pid) {
      const res = await apiPost('/pedidos', { lugar: this.LUGARES[0]?.id || 'Barra 1', cliente: '' });
      pid = res.pedidoId;
      this._pos.pedidoId = pid;
    }
    if (this._pos.splitMode && this._pos.cart.some(i => i.cuenta)) {
      await apiPut(`/pedidos/${pid}`, { cuentasActivas: this._pos.cuentas });
    }
    for (const it of this._pos.cart) {
      if (it.detalleId) {
        await apiPut(`/pedidos/items/${it.detalleId}`, { cantidad: it.cant, precioUnitario: it.precio, notas: it.notas, cuenta: it.cuenta || null });
      } else {
        const res = await apiPost(`/pedidos/${pid}/items`, { codigo: it.codigo, nombre: it.nombre, cantidad: it.cant, precioUnitario: it.precio, notas: it.notas, cuenta: it.cuenta || null });
        it.detalleId = res.detalleId || res.id;
      }
    }
    const currentIds = this._pos.cart.map(i => i.detalleId).filter(Boolean);
    for (const oldId of this._pos.originalDetalleIds) {
      if (!currentIds.includes(oldId)) {
        try { await apiDelete(`/pedidos/items/${oldId}`); } catch(e) {}
      }
    }
    this._pos.originalDetalleIds = [...currentIds];
    return pid;
  },

  async _posComanda() {
    if (!this._pos.cart.length) return;
    try { await this._posSyncCart(); } catch(e) { alert('Error: ' + e.message); return; }
    if (this._pos.pedidoId && window.Ticket) Ticket.mostrarModal(this._pos.pedidoId, { tipo: 'comanda' });
  },

  _posCancelarPedido() {
    if (!this._pos.pedidoId) return;
    const pd = this._pos.pedidoData;
    let msg = '¿Cancelar este pedido y liberar la mesa?';
    if (pd && pd.totalPagado > 0) {
      msg += `\n\n⚠️ Este pedido tiene pagos registrados por ${this.fmt(pd.totalPagado)}. Se reversarán.`;
    }
    if (!confirm(msg)) return;
    const motivo = prompt('Motivo de cancelación:', '');
    if (motivo === null) return;
    cancelarPedido(this._pos.pedidoId, motivo.trim() || 'Cancelado por colaborador')
      .then(res => {
        this._pos.cart = [];
        this._pos.pedidoId = null;
        this._pos.pedidoData = null;
        this.showMessage('mesaMsg', res.mensaje, 'success');
        this.cargarVistaMesas();
      })
      .catch(err => alert('Error: ' + err.message));
  },

  _posEditarPedido() {
    if (!this._pos.pedidoId) return;
    const pd = this._pos.pedidoData;
    if (!pd) return;
    const html = `<div class="pos-split-modal">
      <h3 class="pos-split-title">Editar Pedido</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="font-size:0.85rem;font-weight:600;color:var(--text);">Cliente</label>
        <input type="text" id="posEditCliente" value="${this.escapeHtml(pd.cliente || '')}" style="padding:8px 12px;border:2px solid var(--border);border-radius:var(--radius);font-size:0.9rem;background:var(--surface);color:var(--text);">
        <label style="font-size:0.85rem;font-weight:600;color:var(--text);">Notas</label>
        <textarea id="posEditNotas" rows="2" style="padding:8px 12px;border:2px solid var(--border);border-radius:var(--radius);font-size:0.9rem;background:var(--surface);color:var(--text);resize:vertical;">${this.escapeHtml(pd.notas || '')}</textarea>
      </div>
      <div class="pos-split-footer">
        <button class="pos-btn-outline" data-action="pos-cancelar" type="button">Cancelar</button>
        <button class="pos-btn-primary" data-action="pos-guardar-edicion" type="button">Guardar</button>
      </div>
    </div>`;
    this.mostrarModal(html);
  },

  async _posGuardarEdicion() {
    const cliente = document.getElementById('posEditCliente')?.value || '';
    const notas = document.getElementById('posEditNotas')?.value || '';
    try {
      await apiPut(`/pedidos/${this._pos.pedidoId}`, { cliente, notas });
      this.cerrarModal();
      this.mostrarPosOrder(this._pos.pedidoId);
    } catch(e) { alert('Error: ' + e.message); }
  },

  // ═══ SPLIT BILL ═════════════════════════════════════
  _posSplit() {
    if (this._pos.cart.length < 2) return;
    if (!this._pos.splitMode) {
      this._pos.splitMode = true;
      this._pos.cart.forEach((item, idx) => { item.cuenta = this._pos.cuentas[idx % this._pos.cuentas.length]; });
      this._posRenderTicket();
      return;
    }
    this.mostrarModal(this._posSplitModalHtml());
  },

  _posSplitModalHtml() {
    const cuentas = this._pos.cuentas;
    const items = this._pos.cart;
    const accounts = cuentas.map(c => {
      const cItems = items.filter(i => i.cuenta === c);
      const total = cItems.reduce((s, i) => this.roundMoney(s + (i.precio * i.cant)), 0);
      return `<div class="pos-split-acc">
        <div class="pos-split-acc-head"><span class="pos-split-acc-label">Cuenta ${c}</span><span class="pos-split-acc-total">${this.fmt(total)}</span></div>
        ${cItems.length ? cItems.map(i => `
          <div class="pos-split-acc-item">
            <span>${this.escapeHtml(i.nombre)} x${i.cant}</span>
            <span>${this.fmt(i.precio * i.cant)}</span>
          </div>`).join('') : '<div class="pos-split-acc-empty">Sin items</div>'}
      </div>`;
    }).join('');

    const itemRows = items.map((i, idx) => `
      <div class="pos-split-row">
        <span class="pos-split-item-name">${this.escapeHtml(i.nombre)} x${i.cant}</span>
        <div class="pos-split-btns">
          ${cuentas.map(c => `<button class="pos-split-assign ${i.cuenta === c ? 'active' : ''}" data-action="pos-split-assign" data-idx="${idx}" data-cuenta="${c}" type="button">${c}</button>`).join('')}
        </div>
      </div>`).join('');

    return `
      <div class="pos-split-modal">
        <h3 class="pos-split-title">Dividir Cuenta</h3>
        <div class="pos-split-section">
          <div class="pos-split-section-label">Asignar items:</div>
          ${itemRows}
        </div>
        <div class="pos-split-section">
          <div class="pos-split-section-label">Resumen por cuenta:</div>
          ${accounts}
        </div>
        <div class="pos-split-footer">
          <button class="pos-btn-outline" data-action="pos-split-cancel" type="button">Cancelar</button>
          <button class="pos-btn-primary" data-action="pos-split-confirm" type="button">Confirmar</button>
        </div>
      </div>`;
  },

  _posSplitAssign(idx, cuenta) {
    this._pos.cart[idx].cuenta = cuenta;
    const modal = document.querySelector('.pos-split-modal');
    if (modal) modal.innerHTML = this._posSplitModalHtml();
  },

  _posSplitConfirm() {
    this.cerrarModal();
    this._posRenderTicket();
  },

  _posSplitCancel() {
    this._pos.splitMode = false;
    this._pos.cart.forEach(i => { delete i.cuenta; });
    this.cerrarModal();
    this._posRenderTicket();
  },

  _posCobrarCuenta(cuenta) {
    if (!this._pos.cart.length) return;
    const items = this._pos.cart.filter(i => (i.cuenta || 'A') === cuenta);
    if (!items.length) return;
    const total = items.reduce((s, i) => this.roundMoney(s + (i.precio * i.cant)), 0);
    this._posCobrarWithItems(items, total, `Cuenta ${cuenta}`);
  },

  async _posCobrarWithItems(items, total, titulo) {
    try { await this._posSyncCart(); } catch(e) { alert('Error guardando items: ' + e.message); return; }

    const isSplit = this._pos.splitMode;
    const cuenta = isSplit ? (items[0]?.cuenta || 'A') : null;

    this.mostrarModalPago({
      total,
      titulo: `💳 ${titulo}`,
      onConfirm: (pagos, cambio) => {
        const promise = isSplit && cuenta
          ? cerrarCuentaPedido(this._pos.pedidoId, cuenta, pagos, cambio)
          : cerrarPedido(this._pos.pedidoId, pagos, cambio);
        promise
          .then(res => {
            this.cerrarModal();
            this.showMessage('mesaMsg', res.mensaje, 'success');
            if (window.Ticket) Ticket.mostrarModal(this._pos.pedidoId, { cambio });
            if (isSplit) {
              this._pos.cart = this._pos.cart.filter(i => (i.cuenta || 'A') !== cuenta);
              this._pos.originalDetalleIds = this._pos.originalDetalleIds.filter(id => {
                const paidItem = items.find(it => it.detalleId === id);
                return !paidItem;
              });
              if (this._pos.cart.length === 0) {
                this._pos.splitMode = false;
                this._pos.pedidoId = null;
                this.cargarVistaMesas();
              } else {
                this._posRenderTicket();
              }
            } else {
              this._pos.cart = [];
              this._pos.pedidoId = null;
              this.cargarVistaMesas();
            }
          })
          .catch(err => this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
      }
    });
  }
});
