// Copito POS — Split bill, account payments, and tips.
// Extends the global App facade. Loaded after pedidos.js.
Object.assign(App, {

  activarSplit() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    const detail = document.getElementById('pedidoDetail');
    obtenerPedido(pedidoId).then(pedido => {
      const sinCuenta = pedido.items.filter(i => !i.cuenta);
      if (!sinCuenta.length) return;
      const cuentas = this.state.cuentas.length >= 2 ? this.state.cuentas : ['A', 'B'];
      actualizarPedido(pedidoId, { cuentasActivas: cuentas }).then(() => {
        const promises = sinCuenta.map((item, idx) => {
          const cuenta = cuentas[idx % cuentas.length];
          return modificarItemPedido(item.id, { cantidad: item.cantidad, precioUnitario: item.precioUnitario, notas: item.notas, cuenta });
        });
        return Promise.all(promises);
      }).then(() => {
        this.showMessage('pedidoDetail', `Items distribuidos entre cuentas: ${cuentas.join(', ')}`, 'success');
        this.verPedido(pedidoId);
      }).catch(err => {
        this.showMessage(detail ? 'pedidoDetail' : 'mesaMsg', 'Error al dividir: ' + err.message, 'error');
      });
    });
  },

  agregarCuenta() {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const existentes = this.getCuentasDelPedido(pedido);
      const nueva = this.getSiguienteCuenta(existentes);
      if (!this.state.cuentas.includes(nueva)) this.state.cuentas = [...this.state.cuentas, nueva];
      actualizarPedido(pedidoId, { cuentasActivas: this.state.cuentas }).then(() => {
        this.showMessage('pedidoDetail', `Cuenta ${nueva} agregada. Asigne items usando los botones.`, 'success');
        this.verPedido(pedidoId);
      }).catch(err => { this.showMessage('pedidoDetail', 'Error al guardar cuenta: ' + err.message, 'error'); });
    });
  },

  asignarCuenta(detalleId, cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      modificarItemPedido(detalleId, { cantidad: item.cantidad, precioUnitario: item.precioUnitario, notas: item.notas, cuenta })
        .then(() => { this.verPedido(pedidoId); })
        .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
    });
  },

  cerrarCuenta(cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const totalCuenta = pedido.items.filter(i => i.cuenta === cuenta).reduce((s, i) => App.sumMoney(s, i.subtotal), 0);
      if (totalCuenta <= 0) { this.showMessage('mesaMsg', 'Cuenta ' + cuenta + ' no tiene items', 'error'); return; }
      this.mostrarModalPago({
        total: totalCuenta, titulo: `🔒 Cerrar Cuenta ${cuenta}`,
        onConfirm: (pagos, cambio) => {
          cerrarCuentaPedido(pedidoId, cuenta, pagos, cambio)
            .then(res => { this._openPdf(res); this.showMessage('mesaMsg', res.mensaje, 'success');
              if (this.state.currentCuentaSeleccionada === cuenta) this.state.currentCuentaSeleccionada = null;
              this.verPedido(pedidoId);
            }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
        }
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

  pagarItem(detalleId) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) { this.showMessage('mesaMsg', 'Item no encontrado', 'error'); return; }
      this.mostrarModalPago({
        total: item.subtotal, titulo: `💳 Pagar: ${item.nombre}`,
        onConfirm: (pagos, cambio) => {
          cerrarItemPedido(pedidoId, detalleId, pagos, cambio)
            .then(res => { this._openPdf(res); this.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
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
      const total = detalleIds.reduce((s, id) => { const item = pedido.items.find(i => i.id == id); return App.sumMoney(s, item ? item.subtotal : 0); }, 0);
      const cuentasItems = [...new Set(detalleIds.map(id => { const it = pedido.items.find(i => i.id == id); return it ? (it.cuenta || '__general__') : null; }).filter(c => c !== null))];
      const cuentaUnica = cuentasItems.length === 1 ? (cuentasItems[0] === '__general__' ? null : cuentasItems[0]) : null;
      this.mostrarModalPago({
        total, titulo: `💳 Pagar ${detalleIds.length} items (${this.fmt(total)})${cuentaUnica ? ` — Cuenta ${cuentaUnica}` : ''}`,
        detalleIds,
        onConfirm: (pagos, cambio) => {
          cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio, cuentaUnica)
            .then(res => { this._openPdf(res); this.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
            .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
        }
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

  pagosDeCuenta(pedido, cuenta) {
    if (!pedido.pagos) return 0;
    return pedido.pagos.filter(p => {
      if (p.cuenta === cuenta) return true;
      if (p.detalleId) { const it = (pedido.items || []).find(i => i.id == p.detalleId); return it && it.cuenta === cuenta; }
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
      } else { saldo = pedido.saldoRestante; }
      if (!(saldo > 0)) { this.showMessage('mesaMsg', 'Sin saldo pendiente', 'error'); return; }
      this.mostrarModalAbono({
        saldo, titulo: cuenta ? `💰 Abonar a Cuenta ${cuenta}` : '💰 Abonar al pedido',
        onConfirm: (pagos) => {
          abonarCuenta(pedidoId, cuenta, pagos).then(res => {
            const acumulado = App.roundMoney(res.acumulado); const pendiente = App.roundMoney(res.pendiente);
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
          <div style="flex:1;"><div style="font-weight:600;">${this.escapeHtml(item.nombre)}</div>
            <div style="font-size:0.85rem;color:var(--text-muted);">${item.cantidad} x ${this.fmt(item.precioUnitario)}</div></div>
          <div style="font-weight:700;">${this.fmt(item.subtotal)}</div>
        </label>`).join('');
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
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Productos seleccionados:</span><strong id="ctaSelectedCount">0</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Total a pagar:</span><strong id="ctaSelectedTotal" style="font-size:1.1rem;">$0</strong></div>
        </div>
        <div class="actions" style="margin-top:15px;margin-bottom:0;">
          <button class="btn btn-success" id="btnCtaPagar" disabled style="flex:1;">💳 Pagar seleccionados</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      const updateTotal = () => {
        const checked = modal.querySelectorAll('.cta-item-check:checked');
        let total = 0; checked.forEach(cb => { total = App.sumMoney(total, parseFloat(cb.dataset.subtotal) || 0); });
        const count = checked.length;
        document.getElementById('ctaSelectedCount').textContent = count;
        document.getElementById('ctaSelectedTotal').textContent = this.fmt(total);
        document.getElementById('btnCtaPagar').disabled = count === 0;
        document.getElementById('btnCtaPagar').textContent = count > 0 ? `💳 Pagar ${this.fmt(total)}` : '💳 Pagar seleccionados';
      };
      const selectAll = document.getElementById('ctaSelectAll');
      if (selectAll) selectAll.addEventListener('change', () => { modal.querySelectorAll('.cta-item-check').forEach(cb => { cb.checked = selectAll.checked; }); updateTotal(); });
      modal.querySelectorAll('.cta-item-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const all = modal.querySelectorAll('.cta-item-check');
          if (selectAll) selectAll.checked = all.length > 0 && [...all].every(c => c.checked);
          updateTotal();
        });
      });
      document.getElementById('btnCtaPagar').addEventListener('click', () => {
        const checked = modal.querySelectorAll('.cta-item-check:checked');
        if (!checked.length) return;
        const detalleIds = [...checked].map(cb => parseInt(cb.dataset.detalleid));
        let total = 0; checked.forEach(cb => { total = App.sumMoney(total, parseFloat(cb.dataset.subtotal) || 0); });
        modal.remove();
        this.mostrarModalPago({
          total, titulo: `💳 ${esGeneral ? 'General' : 'Cuenta ' + cuenta} — ${detalleIds.length} item(s)`,
          onConfirm: (pagos, cambio) => {
            cerrarItemsPedido(pedidoId, detalleIds, pagos, cambio, filtroCuenta)
              .then(res => { this._openPdf(res); this.showMessage('mesaMsg', res.mensaje, 'success'); this.verPedido(pedidoId); })
              .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
          }
        });
      });
    }).catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
  },

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
        <select id="propinaMetodoModal" style="border-color:#e91e8c;"><option value="Efectivo">💵 Efectivo</option><option value="Transferencia">🏦 Transferencia</option></select>
      </div>
      <div class="actions" style="margin-bottom:0;gap:8px;">
        <button class="btn" id="btnConfirmarPropina" style="flex:1;background:#e91e8c;color:white;border:none;font-weight:700;" type="button">💝 Registrar Propina</button>
        <button class="btn btn-secondary" id="btnOmitirPropina" type="button">Omitir</button>
      </div>
      <div id="propinaModalMsg" aria-live="polite" style="margin-top:10px;"></div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('btnOmitirPropina').addEventListener('click', () => { modal.remove(); this.cargarVistaMesas(); });
    document.getElementById('btnConfirmarPropina').addEventListener('click', () => {
      const monto = parseFloat(document.getElementById('propinaMontoModal')?.value) || 0;
      const metodo = document.getElementById('propinaMetodoModal')?.value || 'Efectivo';
      if (monto <= 0) { this.showMessage('propinaModalMsg', 'El monto debe ser mayor a cero', 'error'); return; }
      if (monto < 0) { this.showMessage('propinaModalMsg', 'La propina no puede ser negativa', 'error'); return; }
      const btn = document.getElementById('btnConfirmarPropina');
      if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }
      registrarPropina({ pedidoId: pedidoId || null, lugar: lugar || null, monto, metodoPago: metodo })
        .then(res => { this.showMessage('propinaModalMsg', res.mensaje, 'success'); setTimeout(() => { modal.remove(); this.cargarVistaMesas(); }, 1500); })
        .catch(err => { if (btn) { btn.disabled = false; btn.textContent = '💝 Registrar Propina'; } this.showMessage('propinaModalMsg', 'Error: ' + err.message, 'error'); });
    });
  },

  mostrarModalPropinaGeneral() { this.mostrarModalPropina(null, null, 0); }
});
