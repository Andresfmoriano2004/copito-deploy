// Copito POS — Controller for orders, items, split bill, and tips.
// Mediates between PedidosView (templates) and API functions.
const PedidosController = {

  init() {
    Store.subscribe('pedidos', () => this.render());
    this._bindEvents();
  },

  _bindEvents() {
    // Account button delegation for quantity modal (not handled by data-action)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.cuenta-select-btn');
      if (btn) {
        const modal = btn.closest('.modal-backdrop');
        if (modal) {
          modal.querySelectorAll('.cuenta-select-btn').forEach(b => {
            b.classList.remove('active');
            const bc = App.getCuentaColor(b.dataset.cuenta);
            b.style.border = '2px solid var(--border)';
            b.style.background = 'transparent';
            b.style.color = 'var(--text-muted)';
            b.style.fontWeight = '500';
          });
          btn.classList.add('active');
          const cc = App.getCuentaColor(btn.dataset.cuenta);
          btn.style.border = `2px solid ${cc.text}`;
          btn.style.background = cc.bg;
          btn.style.color = cc.text;
          btn.style.fontWeight = '700';
          Store.set('pedidos.currentCuentaSeleccionada', btn.dataset.cuenta);
        }
      }
    });
  },

  async cargarVistaMesas() {
    Store.set('pedidos.currentId', null);
    Store.set('pedidos.current', null);
    App.state.currentPedidoId = null;
    App.cargarVistaMesas();
  },

  async verPedido(pedidoId) {
    try {
      const pedido = await obtenerPedido(pedidoId);
      App.state.currentPedidoId = pedidoId;
      Store.set('pedidos.currentId', pedidoId);
      Store.set('pedidos.current', pedido);
      Store.set('pedidos.currentCuentasPedido', pedido.cuentasActivas || ['A']);
      // Render the POS view after loading order data
      const mesaView = document.getElementById('mesaView');
      const detail = document.getElementById('pedidoDetail');
      if (mesaView) mesaView.style.display = 'none';
      if (detail) detail.style.display = 'block';
      App.mostrarPosOrder(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error al cargar pedido: ' + err.message, 'error');
    }
  },

  mostrarMenuProductos() {
    App.cerrarModal();
    obtenerProductos().then(productos => {
      Store.set('ui.productosConPrecio', productos);
      const html = PedidosView.menuModal(productos);
      App.mostrarModal(html);
    }).catch(err => {
      App.showMessage('mesaMsg', 'Error al cargar menú: ' + err.message, 'error');
    });
  },

  seleccionarProductoMenu(codigo) {
    const productos = Store.get('ui.productosConPrecio') || [];
    const prod = productos.find(p => p.codigo === codigo);
    if (prod) this.mostrarFormCantidad(prod);
  },

  mostrarFormCantidad(prod) {
    App.cerrarModal();
    const cuentas = Store.get('pedidos.currentCuentasPedido') || [];
    const cuentaActual = Store.get('pedidos.currentCuentaSeleccionada') || (cuentas[0] || 'A');
    const html = PedidosView.cantidadModal(prod.codigo, prod.nombre, prod.precio, { cuentas, cuentaActual });
    App.mostrarModal(html);

    // Bind live subtotal preview
    const upd = () => {
      const c = parseFloat(document.getElementById('cantMenu')?.value) || 0;
      const p = parseFloat(document.getElementById('precioMenu')?.value) || 0;
      document.getElementById('previewSubtotal').textContent = App.fmt(App.roundMoney(c * p));
    };
    document.getElementById('cantMenu')?.addEventListener('input', upd);
    document.getElementById('precioMenu')?.addEventListener('input', upd);
  },

  async guardarItemMenu() {
    const modal = document.querySelector('.modal-backdrop');
    const codigo = modal?.querySelector('[data-codigo]')?.dataset.codigo;
    const cantidad = parseFloat(document.getElementById('cantMenu')?.value);
    const precioUnitario = Math.round(parseFloat(document.getElementById('precioMenu')?.value) || 0);
    const notas = document.getElementById('notasMenu')?.value?.trim() || '';
    const pedidoId = Store.get('pedidos.currentId');
    const productos = Store.get('ui.productosConPrecio') || [];
    const prod = productos.find(p => p.codigo === codigo);

    if (!codigo || !cantidad || !precioUnitario) { App.showMessage('mesaMsg', 'Complete cantidad y precio', 'error'); return; }
    if (!pedidoId) { App.showMessage('mesaMsg', 'No hay pedido activo', 'error'); return; }

    const data = { codigo, nombre: prod ? prod.nombre : '', cantidad, precioUnitario, notas };
    const cuentaSeleccionada = Store.get('pedidos.currentCuentaSeleccionada');
    const cuentasPedido = Store.get('pedidos.currentCuentasPedido') || [];
    if (cuentaSeleccionada && cuentasPedido.length > 0) data.cuenta = cuentaSeleccionada;

    try {
      await agregarItemPedido(pedidoId, data);
      App.cerrarModal();
      App.showMessage('mesaMsg', 'Item agregado', 'success');
      await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async mostrarFormModificarItem(detalleId) {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      App.cerrarModal();
      Store.set('pedidos._editingItemCuenta', item.cuenta || null);
      const cuentas = Store.get('pedidos.currentCuentasPedido') || [];
      const html = PedidosView.modificarItemModal(item, { cuentas, cuentaActual: item.cuenta });
      App.mostrarModal(html);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async guardarModItem(detalleId) {
    const cantidad = parseFloat(document.getElementById('editCantMenu')?.value);
    const precioUnitario = Math.round(parseFloat(document.getElementById('editPrecioMenu')?.value) || 0);
    const notas = document.getElementById('editNotasMenu')?.value?.trim() || '';
    if (!cantidad || !precioUnitario) { App.showMessage('mesaMsg', 'Complete cantidad y precio', 'error'); return; }
    const data = { cantidad, precioUnitario, notas };
    const activeBtn = document.querySelector('.edit-cuenta-btn.active');
    data.cuenta = activeBtn ? activeBtn.dataset.cuenta : (Store.get('pedidos._editingItemCuenta') || null);

    try {
      await modificarItemPedido(detalleId, data);
      App.cerrarModal();
      App.showMessage('mesaMsg', 'Item modificado', 'success');
      const pedidoId = Store.get('pedidos.currentId');
      if (pedidoId) await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async confirmarEliminarItem(detalleId) {
    if (!confirm('¿Eliminar este item del pedido?')) return;
    try {
      await eliminarItemPedido(detalleId);
      App.showMessage('mesaMsg', 'Item eliminado', 'success');
      const pedidoId = Store.get('pedidos.currentId');
      if (pedidoId) await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async confirmarCerrarPedido() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const totalPagado = (pedido.pagos || []).reduce((s, p) => App.sumMoney(s, p.monto), 0);
      const saldo = App.subMoney(pedido.total, totalPagado);
      if (saldo <= 0) { App.showMessage('mesaMsg', 'El pedido ya está totalmente pagado', 'warning'); return; }
      const html = PedidosView.cerrarPedidoModal(pedido, saldo, totalPagado);
      App.mostrarModal(html);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async confirmarCerrarPedidoPago() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    const propina = parseFloat(document.getElementById('propinaInputPrev')?.value) || 0;
    if (propina < 0) { App.showMessage('mesaMsg', 'La propina no puede ser negativa', 'error'); return; }
    try {
      const pedido = await obtenerPedido(pedidoId);
      const totalPagado = (pedido.pagos || []).reduce((s, p) => App.sumMoney(s, p.monto), 0);
      const saldo = App.subMoney(pedido.total, totalPagado);
      App.cerrarModal();
      App.mostrarModalPago({
        total: saldo,
        titulo: '🔒 Cerrar Pedido',
        onConfirm: (pagos, cambio) => this.procesarCierre(pagos, cambio, propina, pedido.lugar)
      });
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async procesarCierre(pagos, cambio, propina = 0, lugar = null) {
    const totalNum = pagos.reduce((s, p) => App.sumMoney(s, p.monto), 0);
    const metodosStr = pagos.map(p => `${p.metodoPago}: ${App.fmt(p.monto)}`).join(', ');
    let msg = `¿Confirmar cierre del pedido por ${App.fmt(totalNum)}?\n\n${metodosStr}\n\nSe descontará el stock.`;
    if (propina > 0) msg += `\n\nℹ️ La propina de ${App.fmt(propina)} se registrará después.`;
    if (!confirm(msg)) return;

    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;

    try {
      const res = await cerrarPedido(pedidoId, pagos, cambio);
      App.showMessage('mesaMsg', res.mensaje, 'success');
      Store.set('pedidos.currentId', null);
      if (res.pdf) { App._openPdf(res); }
      else if (window.Ticket) { Ticket.mostrarModal(pedidoId, { cambio }); }
      else { descargarPDFPedido(pedidoId); }
      if (propina > 0) { this.mostrarModalPropina(pedidoId, lugar); }
      else { this.cargarVistaMesas(); }
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async confirmarCancelarPedido() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      let msg = '¿Cancelar este pedido y liberar la mesa?';
      if (pedido.totalPagado > 0) {
        msg += `\n\n⚠️ Este pedido tiene pagos por ${App.fmt(pedido.totalPagado)}. Se reversarán.`;
        msg += `\nMotivo de cancelación: (obligatorio)`;
      }
      if (!confirm(msg)) return;
      const motivo = prompt(pedido.totalPagado > 0 ? 'Motivo de cancelación (obligatorio):' : 'Motivo:', '');
      if (motivo === null) return;
      if (pedido.totalPagado > 0 && !motivo.trim()) {
        App.showMessage('mesaMsg', 'El motivo es obligatorio cuando hay pagos', 'error'); return;
      }
      await cancelarPedido(pedidoId, motivo.trim() || 'Cancelado por colaborador');
      Store.set('pedidos.currentId', null);
      App.showMessage('mesaMsg', 'Pedido cancelado', 'success');
      this.cargarVistaMesas();
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async mostrarFormEditarPedido() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      App.cerrarModal();
      const html = PedidosView.editarPedidoModal(pedido, App.LUGARES);
      App.mostrarModal(html);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async guardarEdicionPedido() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    const cliente = document.getElementById('editPedidoCliente')?.value?.trim() || '';
    const lugar = document.getElementById('editPedidoLugar')?.value;
    const notas = document.getElementById('editPedidoNotas')?.value?.trim() || '';
    if (!lugar) { App.showMessage('mesaMsg', 'Seleccione un lugar', 'error'); return; }
    try {
      await actualizarPedido(pedidoId, { cliente, lugar, notas });
      App.cerrarModal();
      App.showMessage('mesaMsg', 'Pedido actualizado', 'success');
      await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  // ─── Split Bill ────────────────────────────────────
  async activarSplit() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const sinCuenta = pedido.items.filter(i => !i.cuenta);
      if (!sinCuenta.length) return;
      const cuentas = Store.get('pedidos.cuentas') || ['A', 'B'];
      await actualizarPedido(pedidoId, { cuentasActivas: cuentas });
      const promises = sinCuenta.map((item, idx) => {
        const cuenta = cuentas[idx % cuentas.length];
        return modificarItemPedido(item.id, { cantidad: item.cantidad, precioUnitario: item.precioUnitario, notas: item.notas, cuenta });
      });
      await Promise.all(promises);
      Store.set('pedidos.splitMode', true);
      App.showMessage('mesaMsg', `Items distribuidos entre cuentas: ${cuentas.join(', ')}`, 'success');
      await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error al dividir: ' + err.message, 'error');
    }
  },

  async agregarCuenta() {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const existentes = App.getCuentasDelPedido(pedido);
      const nueva = App.getSiguienteCuenta(existentes);
      const cuentas = Store.get('pedidos.cuentas') || ['A', 'B'];
      if (!cuentas.includes(nueva)) {
        Store.set('pedidos.cuentas', [...cuentas, nueva]);
      }
      await actualizarPedido(pedidoId, { cuentasActivas: Store.get('pedidos.cuentas') });
      App.showMessage('mesaMsg', `Cuenta ${nueva} agregada. Asigne items.`, 'success');
      await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async asignarCuenta(detalleId, cuenta) {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      await modificarItemPedido(detalleId, { cantidad: item.cantidad, precioUnitario: item.precioUnitario, notas: item.notas, cuenta });
      await this.verPedido(pedidoId);
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async cerrarCuenta(cuenta) {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const totalCuenta = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => App.sumMoney(s, i.subtotal), 0);
      if (totalCuenta <= 0) { App.showMessage('mesaMsg', 'Cuenta ' + cuenta + ' sin items', 'error'); return; }
      App.mostrarModalPago({
        total: totalCuenta, titulo: `🔒 Cerrar Cuenta ${cuenta}`,
        onConfirm: (pagos, cambio) => {
          cerrarCuentaPedido(pedidoId, cuenta, pagos, cambio)
            .then(res => { App._openPdf(res); App.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
            .catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
        }
      });
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async pagarItem(detalleId) {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      App.mostrarModalPago({
        total: item.subtotal, titulo: `💳 Pagar: ${item.nombre}`,
        onConfirm: (pagos, cambio) => {
          cerrarItemPedido(pedidoId, detalleId, pagos, cambio)
            .then(res => { App._openPdf(res); App.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
            .catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
        }
      });
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async pagarSeleccionados() {
    const detail = document.getElementById('pedidoDetail');
    if (!detail) return;
    const checked = detail.querySelectorAll('.item-checkbox:checked');
    if (!checked.length) return;
    const detalleIds = Array.from(checked).map(c => parseInt(c.dataset.detalleid));
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const total = detalleIds.reduce((s, id) => { const item = pedido.items.find(i => i.id == id); return App.sumMoney(s, item ? item.subtotal : 0); }, 0);
      App.mostrarModalPago({
        total, titulo: `💳 Pagar ${detalleIds.length} items (${App.fmt(total)})`,
        detalleIds,
        onConfirm: (pagos, cambio) => {
          cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio, null)
            .then(res => { App._openPdf(res); App.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
            .catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
        }
      });
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async abonarCuentaUI(cuenta) {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      let saldo;
      if (cuenta) {
        const totalC = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => App.sumMoney(s, i.subtotal), 0);
        const pagadoCuenta = pedido.pagos.filter(p => p.cuenta === cuenta).reduce((s, p) => App.sumMoney(s, p.monto), 0);
        saldo = App.subMoney(totalC, pagadoCuenta);
      } else { saldo = pedido.saldoRestante; }
      if (!(saldo > 0)) { App.showMessage('mesaMsg', 'Sin saldo pendiente', 'error'); return; }
      App.mostrarModalAbono({
        saldo, titulo: cuenta ? `💰 Abonar a Cuenta ${cuenta}` : '💰 Abonar al pedido',
        onConfirm: (pagos) => {
          abonarCuenta(pedidoId, cuenta, pagos).then(res => {
            let msg = res.mensaje;
            const totalAbonado = pagos.reduce((s, p) => App.sumMoney(s, p.monto), 0);
            msg += ` | Abonado: ${App.fmt(totalAbonado)} | Pendiente: ${App.fmt(res.pendiente)}`;
            if (res.cuentaCerrada) msg += ' ✔ Cuenta pagada.';
            if (res.pedidoCerrado) msg += ' 🔒 Pedido cerrado.';
            App.showMessage('mesaMsg', msg, 'success');
            this.verPedido(pedidoId);
          }).catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
        }
      });
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async mostrarModalPagarCuenta(cuenta) {
    const pedidoId = Store.get('pedidos.currentId');
    if (!pedidoId) return;
    try {
      const pedido = await obtenerPedido(pedidoId);
      const esGeneral = cuenta === '__general__';
      const itemsCuenta = pedido.items.filter(i => esGeneral ? !i.cuenta : i.cuenta === cuenta);
      const pendientes = itemsCuenta.filter(i => !i.pagado);
      if (!pendientes.length) { App.showMessage('mesaMsg', 'Sin items pendientes', 'error'); return; }

      const pagosA = pedido.pagos.filter(p => p.cuenta === 'A').reduce((s, p) => App.sumMoney(s, p.monto), 0);
      const pagosB = pedido.pagos.filter(p => p.cuenta === 'B').reduce((s, p) => App.sumMoney(s, p.monto), 0);
      const pagosCuenta = pedido.pagos.filter(p => p.cuenta === cuenta).reduce((s, p) => App.sumMoney(s, p.monto), 0);

      const html = PedidosView.pagarCuentaModal(pedido, cuenta, { pagosA, pagosB, pagosCuenta });
      App.mostrarModal(html);

      // Bind checkbox logic
      const modal = document.querySelector('.modal-backdrop');
      if (!modal) return;
      const updateTotal = () => {
        const checked = modal.querySelectorAll('.cta-item-check:checked');
        let total = 0;
        checked.forEach(cb => { total = App.sumMoney(total, parseFloat(cb.dataset.subtotal) || 0); });
        document.getElementById('ctaSelectedCount').textContent = checked.length;
        document.getElementById('ctaSelectedTotal').textContent = App.fmt(total);
        document.getElementById('btnCtaPagar').disabled = checked.length === 0;
        document.getElementById('btnCtaPagar').textContent = checked.length > 0 ? `💳 Pagar ${App.fmt(total)}` : '💳 Pagar seleccionados';
      };
      const selectAll = document.getElementById('ctaSelectAll');
      if (selectAll) selectAll.addEventListener('change', () => {
        modal.querySelectorAll('.cta-item-check').forEach(cb => { cb.checked = selectAll.checked; });
        updateTotal();
      });
      modal.querySelectorAll('.cta-item-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const all = modal.querySelectorAll('.cta-item-check');
          if (selectAll) selectAll.checked = all.length > 0 && [...all].every(c => c.checked);
          updateTotal();
        });
      });
      document.getElementById('btnCtaPagar')?.addEventListener('click', () => {
        const checked = modal.querySelectorAll('.cta-item-check:checked');
        if (!checked.length) return;
        const ids = [...checked].map(cb => parseInt(cb.dataset.detalleid));
        let total = 0;
        checked.forEach(cb => { total = App.sumMoney(total, parseFloat(cb.dataset.subtotal) || 0); });
        modal.remove();
        App.mostrarModalPago({
          total, titulo: `💳 ${esGeneral ? 'General' : 'Cuenta ' + cuenta} — ${ids.length} item(s)`,
          onConfirm: (pagos, cambio) => {
            cerrarItemsPedido(pedidoId, ids, pagos, cambio, esGeneral ? null : cuenta)
              .then(res => { App._openPdf(res); App.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
              .catch(err => App.showMessage('mesaMsg', 'Error: ' + err.message, 'error'));
          }
        });
      });
    } catch (err) {
      App.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },

  // ─── Tips ──────────────────────────────────────────
  mostrarModalPropina(pedidoId, lugar, propinaSugerida = 0) {
    App.cerrarModal();
    const html = PedidosView.propinaModal(pedidoId, lugar, propinaSugerida);
    App.mostrarModal(html);

    document.getElementById('btnOmitirPropina')?.addEventListener('click', () => {
      App.cerrarModal();
      this.cargarVistaMesas();
    });
    document.getElementById('btnConfirmarPropina')?.addEventListener('click', () => {
      const monto = parseFloat(document.getElementById('propinaMontoModal')?.value) || 0;
      const metodo = document.getElementById('propinaMetodoModal')?.value || 'Efectivo';
      if (monto <= 0) { App.showMessage('propinaModalMsg', 'El monto debe ser mayor a cero', 'error'); return; }
      const btn = document.getElementById('btnConfirmarPropina');
      if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }
      registrarPropina({ pedidoId: pedidoId || null, lugar: lugar || null, monto, metodoPago: metodo })
        .then(res => {
          App.showMessage('propinaModalMsg', res.mensaje, 'success');
          setTimeout(() => { App.cerrarModal(); this.cargarVistaMesas(); }, 1500);
        })
        .catch(err => {
          if (btn) { btn.disabled = false; btn.textContent = '💝 Registrar Propina'; }
          App.showMessage('propinaModalMsg', 'Error: ' + err.message, 'error');
        });
    });
  },

  mostrarModalPropinaGeneral() {
    this.mostrarModalPropina(null, null, 0);
  },

  render() {
    // Controllers re-render explicitly — the view update is triggered
    // by calling the appropriate render method after state changes.
    // The pedidoDetail HTML is built by verPedido() which fetches data
    // and renders via the module's existing HTML (now delegated to Views).
  }
};
