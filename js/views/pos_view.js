// Copito POS — Pure view functions for split-screen POS.
// Each function takes data and returns an HTML string. No DOM manipulation.
const PosView = {

  layout(pedidoData) {
    const pid = pedidoData?.pedidoId || '';
    const pd = pedidoData;
    const metaHtml = pd ? `<div class="pos-ticket-meta">
      <div class="pos-meta-row"><span>🍽️ ${App.escapeHtml(pd.lugar || '')}</span>
      <span class="pos-ticket-estado ${pd.estado === 'Cerrado' ? 'cerrado' : 'abierto'}">${pd.estado || 'Abierto'}</span></div>
      <div class="pos-meta-row">${pd.cliente ? `<span>👤 ${App.escapeHtml(pd.cliente)}</span>` : '<span>Sin cliente</span>'}
      <span>${pd.fechaCreacion || ''}</span></div>
    </div>` : '';
    const pagosHtml = pd && pd.pagos && pd.pagos.length ? `<div class="pos-pagos-section" id="posPagosSection">
      <div class="pos-pagos-toggle" data-action="pos-toggle-pagos" type="button">📋 Pagos (${pd.pagos.length}) ▾</div>
      <div class="pos-pagos-list" id="posPagosList" style="display:none;">
        ${pd.pagos.map(p => `<div class="pos-pago-row">
          <span>${p.itemNombre ? '✔ ' + App.escapeHtml(p.itemNombre) : '💰 ' + (p.notas || 'Abono')} <small>${p.metodoPago || ''}</small></span>
          <strong>${App.fmt(p.monto)}</strong>
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

  categories(productos, activeCategory) {
    const grupos = [...new Set(productos.map(p => p.grupo).filter(Boolean))];
    const all = ['Todos', ...grupos];
    return all.map(g => {
      const count = g === 'Todos' ? productos.length : productos.filter(p => p.grupo === g).length;
      return `<button class="pos-cat ${activeCategory === g ? 'active' : ''}"
        data-action="pos-cat" data-cat="${App.escapeHtml(g)}" type="button">
        ${App.escapeHtml(g)} <span class="pos-cat-n">${count}</span>
      </button>`;
    }).join('');
  },

  products(productos, activeCategory, cart, searchQuery) {
    let list = activeCategory === 'Todos' ? productos : productos.filter(p => p.grupo === activeCategory);
    if (searchQuery) list = productos.filter(p => p.nombre.toLowerCase().includes(searchQuery) || p.codigo.toLowerCase().includes(searchQuery));

    if (!list.length) return '<div class="pos-empty">No hay productos</div>';

    return list.map(p => {
      const agotado = (p.stockActual || 0) <= 0;
      const inCart = cart.find(i => i.codigo === p.codigo);
      return `<button class="pos-card ${agotado ? 'agotado' : ''} ${inCart ? 'has-qty' : ''}"
        data-action="${agotado ? '' : 'pos-add'}" data-codigo="${App.escapeHtml(p.codigo)}"
        type="button" ${agotado ? 'disabled' : ''}>
        <span class="pos-card-name">${App.escapeHtml(p.nombre)}</span>
        <span class="pos-card-price">${App.fmt(p.precio)}</span>
        ${agotado ? '<span class="pos-card-tag">AGOTADO</span>' : ''}
        ${inCart ? `<span class="pos-card-qty">${inCart.cant}</span>` : ''}
      </button>`;
    }).join('');
  },

  ticketItems(cart, splitMode, cuentas) {
    if (!cart.length) return '<div class="pos-empty-ticket">Sin productos.<br>Seleccione de la columna izquierda.</div>';

    if (splitMode) {
      let html = '';
      cuentas.forEach(c => {
        const cItems = cart.filter(i => (i.cuenta || 'A') === c);
        if (!cItems.length) return;
        html += `<div class="pos-split-group">
          <div class="pos-split-group-header">Cuenta ${c}</div>
          ${cItems.map(i => PosView._itemHtml(i, true, cart, cuentas)).join('')}
        </div>`;
      });
      return html;
    }
    return cart.map(i => PosView._itemHtml(i, false, cart, cuentas)).join('');
  },

  _itemHtml(i, showCuenta, cart, cuentas) {
    const accBtns = showCuenta ? `<div class="pos-ti-acc">
      ${cuentas.map(c => `<button class="pos-ti-acc-btn ${i.cuenta === c ? 'active acc-' + c.toLowerCase() : ''}" data-action="pos-split-assign" data-idx="${cart.indexOf(i)}" data-cuenta="${c}" type="button">${c}</button>`).join('')}
    </div>` : '';
    return `
      <div class="pos-ti">
        <div class="pos-ti-top">
          <span class="pos-ti-name">${App.escapeHtml(i.nombre)}</span>
          <span class="pos-ti-price">${App.fmt(i.precio)}</span>
        </div>
        ${i.notas ? `<div class="pos-ti-notes">${App.escapeHtml(i.notas)}</div>` : ''}
        <div class="pos-ti-bottom">
          <div class="pos-qty">
            <button class="pos-q-btn minus" data-action="pos-qty" data-codigo="${i.codigo}" data-d="-1" type="button">−</button>
            <span class="pos-q-val">${i.cant}</span>
            <button class="pos-q-btn plus" data-action="pos-qty" data-codigo="${i.codigo}" data-d="1" type="button">+</button>
          </div>
          <span class="pos-ti-sub">${App.fmt(i.precio * i.cant)}</span>
          <button class="pos-ti-del" data-action="pos-qty" data-codigo="${i.codigo}" data-d="-${i.cant}" type="button" title="Quitar del carrito">✕</button>
        </div>
        ${accBtns}
      </div>`;
  },

  summary(cart, splitMode, cuentas) {
    const n = cart.reduce((s, i) => s + i.cant, 0);
    const sub = cart.reduce((s, i) => App.roundMoney(s + (i.precio * i.cant)), 0);

    if (splitMode) {
      let rows = '';
      cuentas.forEach(c => {
        const cTotal = cart.filter(i => (i.cuenta || 'A') === c).reduce((s, i) => App.roundMoney(s + (i.precio * i.cant)), 0);
        if (cTotal > 0) rows += `<div class="pos-sum-row pos-sum-account"><span>Cuenta ${c}</span><span>${App.fmt(cTotal)}</span></div>`;
      });
      return `<div class="pos-sum-row"><span>Productos</span><span>${n}</span></div>
        ${rows}
        <div class="pos-sum-total"><span>TOTAL</span><span>${App.fmt(sub)}</span></div>`;
    }
    return `<div class="pos-sum-row"><span>Productos</span><span>${n}</span></div>
      <div class="pos-sum-total"><span>TOTAL</span><span>${App.fmt(sub)}</span></div>`;
  },

  actions(cart, pedidoId, pedidoData, splitMode, cuentas) {
    const has = cart.length > 0;
    const hasP = !!pedidoId;
    const isClosed = pedidoData && pedidoData.estado !== 'Abierto';
    const sub = cart.reduce((s, i) => App.roundMoney(s + (i.precio * i.cant)), 0);

    if (splitMode) {
      const cuentasBtns = cuentas.map(c => {
        const cTotal = cart.filter(i => (i.cuenta || 'A') === c).reduce((s, i) => App.roundMoney(s + (i.precio * i.cant)), 0);
        if (cTotal <= 0) return '';
        return `<button class="pos-btn-primary pos-btn-split-cobrar" data-action="pos-cobrar-cuenta" data-cuenta="${c}" type="button">💰 Cobrar ${c} — ${App.fmt(cTotal)}</button>`;
      }).join('');
      return `<div class="pos-split-cobrar-btns">${cuentasBtns}</div>
        <div class="pos-btn-row">
          <button class="pos-btn-outline" data-action="pos-split-exit" type="button">↩ Salir división</button>
          <button class="pos-btn-red" data-action="pos-cancelar" type="button" title="Vacía el carrito (borra los items no cobrados)">🧹 Vaciar</button>
        </div>`;
    }
    if (isClosed) {
      return `<button class="pos-btn-primary" data-action="descargar-factura" data-pedidoid="${pedidoId}" type="button">🖨️ Ver Ticket / Factura</button>
        <div class="pos-btn-row">
          <button class="pos-btn-outline" data-action="pos-comanda" type="button">🍽️ Comanda</button>
        </div>`;
    }
    return `<button class="pos-btn-primary ${has ? '' : 'off'}" data-action="${has ? 'pos-cobrar' : ''}" type="button" ${has ? '' : 'disabled'}>💰 Cobrar${has ? ` (${App.fmt(sub)})` : ''}</button>
      <div class="pos-btn-row">
        <button class="pos-btn-outline" data-action="pos-comanda" type="button" ${hasP ? '' : 'disabled'}>🍽️ Comanda</button>
        <button class="pos-btn-outline" data-action="pos-split" type="button" ${has ? '' : 'disabled'}>✂️ Dividir</button>
        <button class="pos-btn-red" data-action="pos-cancelar" type="button" ${has ? '' : 'disabled'} title="Vacía el carrito (borra los items no cobrados)">🧹 Vaciar</button>
      </div>
      ${hasP ? `<div class="pos-btn-row" style="margin-top:4px;">
        <button class="pos-btn-outline" data-action="pos-editar-pedido" type="button">✏️ Editar</button>
        <button class="pos-btn-red" data-action="pos-cancelar-pedido" type="button" style="font-size:0.78rem;" title="Anula todo el pedido y libera la mesa">🚫 Anular pedido</button>
      </div>` : ''}`;
  }
};
