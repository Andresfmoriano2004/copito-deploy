// Copito POS — Pure view functions for orders.
// Each function takes data and returns an HTML string. No DOM manipulation.
const PedidosView = {

  menuGrid(productos) {
    const grupos = [...new Set(productos.map(p => p.grupo))];
    let html = '';
    grupos.forEach(grupo => {
      const prods = productos.filter(p => p.grupo === grupo);
      html += `<div class="menu-grupo">
        <h4 class="menu-grupo-titulo">📦 ${App.escapeHtml(grupo)}</h4>
        <div class="menu-grid">
        ${prods.map(p => {
          const agotado = (p.stockActual || 0) <= 0;
          return `<button class="menu-item${agotado ? ' menu-item-agotado' : ''}" data-action="${agotado ? '' : 'seleccionar-producto-menu'}" data-codigo="${App.escapeHtml(p.codigo)}" data-nombre="${App.escapeHtml(p.nombre)}" data-precio="${p.precio}" ${agotado ? 'disabled title="Sin stock disponible"' : ''}>
          <div class="menu-item-nombre">${App.escapeHtml(p.nombre)}</div>
          <div class="menu-item-precio">${App.fmt(p.precio)}</div>
          ${agotado ? '<div class="menu-item-agotado-badge">AGOTADO</div>' : ''}
        </button>`;
        }).join('')}
        </div>
      </div>`;
    });
    return html;
  },

  menuModal(productos) {
    return `<div class="modal-menu-container">
      <div class="modal-menu-header">
        <h3 class="modal-menu-title">📋 Menú — seleccione un producto</h3>
        <button class="btn btn-secondary btn-sm" data-action="cerrar-modal" type="button">Cerrar</button>
      </div>${this.menuGrid(productos)}</div>`;
  },

  cantidadModal(codigo, nombre, precioBase, options = {}) {
    const { cuentas = [], cuentaActual = null } = options;
    const esSplit = cuentas.length > 0;
    let accountHtml = '';
    if (esSplit) {
      accountHtml = `<div class="form-group" style="grid-column:span 2;"><label>Cuenta</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${cuentas.map(c => {
          const color = App.getCuentaColor(c);
          const active = c === cuentaActual;
          return `<button type="button" class="btn btn-sm cuenta-select-btn${active ? ' active' : ''}" data-cuenta="${c}"
            style="padding:6px 14px;border-radius:6px;border:2px solid ${active ? color.text : 'var(--border)'};background:${active ? color.bg : 'transparent'};color:${active ? color.text : 'var(--text-muted)'};font-weight:${active ? '700' : '500'};cursor:pointer;">
            ${App.getCuentaIcon(c)} ${c}</button>`;
        }).join('')}</div></div>`;
    }
    return `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);" data-codigo="${App.escapeHtml(codigo)}">
      <h3 style="color:var(--primary);margin-bottom:5px;">${App.escapeHtml(nombre)}</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:20px;">Precio base: <strong>${App.fmt(precioBase)}</strong></p>
      ${accountHtml}
      <div class="form-grid" style="grid-template-columns:1fr 1fr;">
        <div class="form-group"><label for="cantMenu">Cantidad</label><input id="cantMenu" type="number" min="0.01" step="1" value="1" required></div>
        <div class="form-group"><label for="precioMenu">Precio Unitario <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem;">(modificable)</span></label>
          <input id="precioMenu" type="number" min="0" step="1" value="${precioBase}" style="border-color:var(--warning);font-weight:600;"></div>
      </div>
      <div class="form-group" style="margin-bottom:15px;"><label for="notasMenu">Notas</label><input id="notasMenu" type="text" placeholder="Ej: sin hielo, bien tostado"></div>
      <div style="margin-bottom:15px;text-align:center;font-size:1.2rem;color:var(--primary-dark);font-weight:700;">Subtotal: <span id="previewSubtotal">${App.fmt(precioBase)}</span></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="guardar-item-menu" type="button" style="flex:1;">Agregar al Pedido</button>
        <button class="btn btn-secondary" data-action="cancelar-item-form" type="button">Cancelar</button>
      </div>
    </div>`;
  },

  modificarItemModal(item, options = {}) {
    const { cuentas = [], cuentaActual = null } = options;
    const esSplit = cuentas.length > 0;
    let accountHtml = '';
    if (esSplit) {
      accountHtml = `<div class="form-group" style="grid-column:span 2;"><label>Cuenta</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${cuentas.map(c => {
          const color = App.getCuentaColor(c); const active = c === cuentaActual;
          return `<button type="button" class="btn btn-sm edit-cuenta-btn${active ? ' active' : ''}" data-cuenta="${c}"
            style="padding:6px 14px;border-radius:6px;border:2px solid ${active ? color.text : 'var(--border)'};background:${active ? color.bg : 'transparent'};color:${active ? color.text : 'var(--text-muted)'};font-weight:${active ? '700' : '500'};cursor:pointer;">
            ${App.getCuentaIcon(c)} ${c}</button>`;
        }).join('')}</div></div>`;
    }
    return `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:20px;">Modificar Item</h3>
      <p style="color:var(--text-muted);margin-bottom:15px;">${App.escapeHtml(item.nombre)}</p>
      ${accountHtml}
      <div class="form-grid" style="grid-template-columns:1fr 1fr;">
        <div class="form-group"><label for="editCantMenu">Cantidad</label><input id="editCantMenu" type="number" min="0.01" step="1" value="${item.cantidad}"></div>
        <div class="form-group"><label for="editPrecioMenu">Precio Unitario</label><input id="editPrecioMenu" type="number" min="0" step="1" value="${item.precioUnitario}"></div>
      </div>
      <div class="form-group" style="margin-bottom:15px;"><label for="editNotasMenu">Notas</label><input id="editNotasMenu" type="text" value="${App.escapeHtml(item.notas)}"></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="guardar-mod-item" data-detalleid="${item.id}" type="button">Guardar</button>
        <button class="btn btn-secondary" data-action="cancelar-item-form" type="button">Cancelar</button>
      </div>
    </div>`;
  },

  cerrarPedidoModal(pedido, saldo, totalPagado) {
    const itemsPend = pedido.items.filter(i => !i.pagado);
    const itemsHtml = itemsPend.map(i => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.9rem;"><span>${App.escapeHtml(i.nombre)} x${i.cantidad}</span><strong>${App.fmt(i.subtotal)}</strong></div>`).join('');
    return `<h3 style="color:var(--primary);margin-bottom:10px;">🔒 Cerrar Pedido</h3>
      <p style="color:var(--text-muted);margin-bottom:10px;font-size:0.9rem;">Productos pendientes por pagar:</p>
      <div style="max-height:200px;overflow-y:auto;margin-bottom:15px;">${itemsHtml}</div>
      <div style="background:var(--primary-bg-light);padding:10px;border-radius:8px;margin-bottom:15px;">
        <div style="display:flex;justify-content:space-between;"><span>Total:</span><strong>${App.fmt(pedido.total)}</strong></div>
        ${totalPagado > 0 ? `<div style="display:flex;justify-content:space-between;color:var(--success-text);"><span>Ya pagado:</span><strong>${App.fmt(totalPagado)}</strong></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;"><span><strong>Pendiente:</strong></span><strong style="color:var(--primary-dark);">${App.fmt(saldo)}</strong></div>
      </div>
      <div class="form-group" style="margin-bottom:15px;">
        <label for="propinaInputPrev" style="color:var(--text-muted);font-size:0.85rem;">💝 Propina (opcional — se registrará <strong>después</strong> del pago de forma independiente)</label>
        <input id="propinaInputPrev" type="number" min="0" step="100" value="0" placeholder="0">
      </div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="confirmar-cerrar-pedido" type="button">💳 Pagar ${App.fmt(saldo)}</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>`;
  },

  editarPedidoModal(pedido, lugares) {
    return `<div style="background:white;border-radius:12px;padding:30px;max-width:450px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:20px;">✏️ Editar Pedido</h3>
      <p style="color:var(--text-muted);margin-bottom:15px;">${App.escapeHtml(pedido.id)} — ${App.escapeHtml(pedido.lugar)}</p>
      <div class="form-grid">
        <div class="form-group"><label for="editPedidoCliente">Cliente</label>
          <input id="editPedidoCliente" type="text" value="${App.escapeHtml(pedido.cliente)}" placeholder="Nombre del cliente"></div>
        <div class="form-group"><label for="editPedidoLugar">Lugar</label>
          <select id="editPedidoLugar">${lugares.map(l => `<option value="${l.id}" ${pedido.lugar === l.id ? 'selected' : ''}>${l.icon} ${l.label}</option>`).join('')}</select></div>
      </div>
      <div class="form-group" style="margin-bottom:20px;"><label for="editPedidoNotas">Notas</label>
        <textarea id="editPedidoNotas" rows="3" placeholder="Observaciones del pedido">${App.escapeHtml(pedido.notas)}</textarea></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="guardar-edicion-pedido" type="button">Guardar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    </div>`;
  },

  // Split bill: pay account modal
  pagarCuentaModal(pedido, cuenta, options = {}) {
    const esGeneral = cuenta === '__general__';
    const filtroCuenta = esGeneral ? null : cuenta;
    const itemsCuenta = pedido.items.filter(i => esGeneral ? !i.cuenta : i.cuenta === cuenta);
    const pendientes = itemsCuenta.filter(i => !i.pagado);
    const cColor = esGeneral ? { bg: 'var(--primary-bg-light)', text: 'var(--primary)' } : App.getCuentaColor(cuenta);
    const totalCuenta = itemsCuenta.reduce((s, i) => App.sumMoney(s, i.subtotal), 0);

    const pagadoCuenta = esGeneral
      ? (pedido.totalPagado - options.pagosA - options.pagosB)
      : (options.pagosCuenta || 0);
    const saldoCuenta = App.subMoney(totalCuenta, Math.max(0, pagadoCuenta));

    const itemsHtml = pendientes.map(item => `
      <label class="item-select-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;cursor:pointer;transition:all 0.15s;">
        <input type="checkbox" class="cta-item-check" data-detalleid="${item.id}" data-subtotal="${item.subtotal}" style="width:20px;height:20px;cursor:pointer;">
        <div style="flex:1;"><div style="font-weight:600;">${App.escapeHtml(item.nombre)}</div>
          <div style="font-size:0.85rem;color:var(--text-muted);">${item.cantidad} x ${App.fmt(item.precioUnitario)}</div></div>
        <div style="font-weight:700;">${App.fmt(item.subtotal)}</div>
      </label>`).join('');

    return `<div style="background:white;border-radius:12px;padding:25px;max-width:500px;width:95%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:${cColor.text};margin-bottom:5px;">${esGeneral ? '📋' : App.getCuentaIcon(cuenta)} Pagar ${esGeneral ? 'General' : 'Cuenta ' + cuenta}</h3>
      <div style="display:flex;gap:15px;flex-wrap:wrap;margin-bottom:15px;font-size:0.9rem;">
        <span>Total: <strong>${App.fmt(totalCuenta)}</strong></span>
        <span>Pagado: <strong style="color:var(--success-text);">${App.fmt(pagadoCuenta)}</strong></span>
        <span>Saldo: <strong style="color:${cColor.text};">${App.fmt(saldoCuenta)}</strong></span>
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
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Productos seleccionados:</span><strong id="ctaSelectedCount">0</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Total a pagar:</span><strong id="ctaSelectedTotal" style="font-size:1.1rem;">$0</strong></div>
      </div>
      <div class="actions" style="margin-top:15px;margin-bottom:0;">
        <button class="btn btn-success" id="btnCtaPagar" disabled style="flex:1;">💳 Pagar seleccionados</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    </div>`;
  },

  // Tip modal
  propinaModal(pedidoId, lugar, propinaSugerida = 0) {
    return `<div style="background:white;border-radius:16px;padding:30px;max-width:420px;width:92%;box-shadow:0 25px 70px rgba(0,0,0,0.35);border-top:4px solid #e91e8c;">
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:2.5rem;margin-bottom:8px;">💝</div>
        <h3 style="color:#e91e8c;margin:0 0 6px;">Registrar Propina</h3>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0;">Esta propina es <strong>independiente</strong> de la venta de productos y se registrará por separado en la caja.</p>
      </div>
      <div style="background:#fce4ec;border-radius:10px;padding:12px 16px;margin-bottom:18px;border:1px solid #f48fb1;">
        <div style="font-size:0.8rem;font-weight:700;color:#c2185b;margin-bottom:4px;">⚠️ PROPINA — No es parte de la venta</div>
        ${pedidoId ? `<div style="font-size:0.85rem;color:#880e4f;">Pedido: <strong>${App.escapeHtml(pedidoId)}</strong>${lugar ? ' — ' + App.escapeHtml(lugar) : ''}</div>` : '<div style="font-size:0.85rem;color:#880e4f;">Propina general (sin pedido asociado)</div>'}
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label for="propinaMontoModal" style="font-weight:600;">Monto de la Propina</label>
        <input id="propinaMontoModal" type="number" min="0" step="1000" value="${propinaSugerida > 0 ? propinaSugerida : ''}" placeholder="0" style="font-size:1.3rem;font-weight:700;border-color:#e91e8c;">
      </div>
      <div class="form-group" style="margin-bottom:18px;">
        <label for="propinaMetodoModal" style="font-weight:600;">Método de Recepción</label>
        <select id="propinaMetodoModal" style="border-color:#e91e8c;"><option value="Efectivo">💵 Efectivo</option><option value="Transferencia">🏦 Transferencia</option></select>
      </div>
      <div class="actions" style="margin-bottom:0;gap:8px;">
        <button class="btn" id="btnConfirmarPropina" style="flex:1;background:#e91e8c;color:white;border:none;font-weight:700;" type="button">💝 Registrar Propina</button>
        <button class="btn btn-secondary" id="btnOmitirPropina" type="button">Omitir</button>
      </div>
      <div id="propinaModalMsg" aria-live="polite" style="margin-top:10px;"></div>
    </div>`;
  }
};
