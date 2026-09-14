// Copito POS — Modales, mensajes y spinner compartidos.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  mostrarModalPago({ total, titulo, onConfirm, showCambio, detalleIds }) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';

    let metodosHtml = '';
    this.METODOS_PAGO.forEach(m => {
      metodosHtml += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:8px 10px;background:var(--primary-bg-light);border-radius:8px;">
        <span style="font-size:1.3rem;">${m.icon}</span>
        <span style="flex:1;font-weight:600;">${m.label}</span>
        <span style="font-size:0.75rem;padding:2px 8px;border-radius:10px;background:${m.tipo === 'FISICO' ? 'var(--success-bg)' : 'var(--info-bg)'};color:${m.tipo === 'FISICO' ? 'var(--success-text)' : 'var(--info-text)'};margin-right:8px;">${m.tipo}</span>
        <input id="pagoMonto_${m.id}" type="number" min="0" step="100" value="0" style="width:130px;text-align:right;font-weight:700;font-size:1rem;padding:8px;">
      </div>`;
    });

    // Show selected items if paying specific items
    let itemsInfoHtml = '';
    if (detalleIds && detalleIds.length > 1) {
      const pedidoId = this.state.currentPedidoId;
      if (pedidoId) {
        obtenerPedido(pedidoId).then(ped => {
          const names = detalleIds.map(id => {
            const it = ped.items.find(i => i.id === id);
            return it ? it.nombre : null;
          }).filter(Boolean);
          const itemsDiv = document.getElementById('pagoItemsList');
          if (itemsDiv && names.length) {
            itemsDiv.innerHTML = names.map(n => `<div style="padding:3px 0;font-size:0.85rem;color:var(--text-muted);">• ${this.escapeHtml(n)}</div>`).join('');
          }
        });
        itemsInfoHtml = `<div id="pagoItemsList" style="margin-bottom:10px;padding:8px 12px;background:var(--primary-bg-light);border-radius:8px;max-height:150px;overflow-y:auto;"></div>`;
      }
    }

    const reciboHtml = showCambio !== false ? `
      <hr style="border-color:var(--primary-border);margin:15px 0;">
      <div class="form-group">
        <label for="montoRecibido" style="font-weight:700;">💰 Monto recibido del cliente</label>
        <input id="montoRecibido" type="number" min="0" step="100" value="0" style="width:100%;padding:12px;font-size:1.2rem;font-weight:700;border:2px solid var(--primary);border-radius:8px;text-align:right;">
      </div>
    ` : '';

    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:480px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:5px;">${titulo}</h3>
      ${itemsInfoHtml}
      <div style="font-size:2rem;font-weight:800;color:var(--primary-dark);margin:10px 0 20px;padding:12px;background:var(--primary-bg);border-radius:12px;text-align:center;">${this.fmt(total)}</div>
      ${metodosHtml}
      ${reciboHtml}
      <hr style="border-color:var(--primary-border);margin:15px 0;">
      <div style="display:flex;justify-content:space-between;font-size:1.1rem;margin-bottom:8px;">
        <span>Asignado:</span><span id="pagoAsignado" style="font-weight:700;color:var(--danger);">${this.fmt(0)}</span>
      </div>
      <div id="pagoCambioDisplay" style="display:none;justify-content:space-between;font-size:1.2rem;margin-bottom:8px;padding:8px 0;border-top:1px dashed var(--warning);">
        <span style="font-weight:700;color:var(--warning-text);">🔄 Cambio:</span><span id="pagoCambioValor" style="font-weight:700;color:var(--warning-text);">${this.fmt(0)}</span>
      </div>
      <div id="pagoEstadoMsg" style="font-size:0.9rem;margin-bottom:15px;min-height:24px;"></div>
      <div class="actions" style="margin-bottom:0;">
        <button id="btnConfirmarPago" class="btn btn-success" style="flex:1;font-size:1.1rem;padding:14px;" disabled type="button">✅ Pagar ${this.fmt(total)}</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const asignadoSpan = document.getElementById('pagoAsignado');
    const estadoMsg = document.getElementById('pagoEstadoMsg');
    const btnConfirmar = document.getElementById('btnConfirmarPago');
    const cambioDisplay = document.getElementById('pagoCambioDisplay');
    const cambioValor = document.getElementById('pagoCambioValor');
    const reciboInput = document.getElementById('montoRecibido');

    const actualizar = () => {
      let asignado = 0;
      let hayEfectivo = false;
      this.METODOS_PAGO.forEach(m => {
        const val = Math.round(parseFloat(document.getElementById(`pagoMonto_${m.id}`)?.value) || 0);
        asignado = this.sumMoney(asignado, val);
        if (val > 0 && m.tipo === 'FISICO') hayEfectivo = true;
      });
      asignadoSpan.textContent = this.fmt(asignado);

      // Las transferencias no requieren monto recibido ni cálculo de cambio.
      if (reciboInput) {
        if (asignado > 0 && !hayEfectivo) {
          reciboInput.disabled = true;
          reciboInput.value = '';
          reciboInput.style.opacity = '0.5';
          cambioDisplay.style.display = 'none';
        } else {
          reciboInput.disabled = false;
          reciboInput.style.opacity = '1';
        }
      }

      if (reciboInput && !reciboInput.disabled) {
        const montoRecibido = Math.round(parseFloat(reciboInput.value) || 0);
        if (montoRecibido >= asignado && asignado >= this.subMoney(total, 0.01)) {
          const cambio = this.subMoney(montoRecibido, total);
          if (cambio > 0) {
            cambioDisplay.style.display = 'flex';
            cambioValor.textContent = this.fmt(cambio);
          } else {
            cambioDisplay.style.display = 'none';
          }
        } else {
          cambioDisplay.style.display = 'none';
        }
      }

      const esTransferencia = asignado > 0 && !hayEfectivo;

      if (asignado <= 0) {
        estadoMsg.innerHTML = '<span style="color:var(--text-muted);">Asigne montos a los métodos de pago</span>';
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = `✅ Asigne montos`;
      } else if (asignado < this.subMoney(total, 0.01)) {
        const falta = total - asignado;
        estadoMsg.innerHTML = `<span style="color:var(--danger);font-weight:600;">⚠️ Faltan ${this.fmt(falta)}</span>`;
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = `✅ Faltan ${this.fmt(falta)}`;
      } else if (esTransferencia) {
        estadoMsg.innerHTML = '<span style="color:var(--success);font-weight:600;">✔ Pago por transferencia</span>';
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = `✅ Pagar ${this.fmt(total)}`;
      } else if (reciboInput && (parseFloat(reciboInput.value) || 0) < asignado) {
        estadoMsg.innerHTML = `<span style="color:var(--warning-text);font-weight:600;">El monto recibido debe cubrir el total asignado</span>`;
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = `✅ Complete monto recibido`;
      } else {
        const cambio = this.subMoney(parseFloat(reciboInput.value) || 0, total);
        if (cambio > 0) {
          estadoMsg.innerHTML = `<span style="color:var(--warning-text);font-weight:600;">Cambio a devolver: ${this.fmt(cambio)}</span>`;
        } else {
          estadoMsg.innerHTML = '<span style="color:var(--success);font-weight:600;">✔ Monto exacto</span>';
        }
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = `✅ Pagar ${this.fmt(total)}`;
      }
    };

    this.METODOS_PAGO.forEach(m => {
      const el = document.getElementById(`pagoMonto_${m.id}`);
      if (el) el.addEventListener('input', actualizar);
    });
    if (reciboInput) reciboInput.addEventListener('input', actualizar);

    btnConfirmar.addEventListener('click', () => {
      const pagos = [];
      this.METODOS_PAGO.forEach(m => {
        const monto = Math.round(parseFloat(document.getElementById(`pagoMonto_${m.id}`)?.value) || 0);
        if (monto > 0) pagos.push({ metodoPago: m.id, monto });
      });
      if (!pagos.length) return;
      const cambio = reciboInput && !reciboInput.disabled ? Math.max(0, this.subMoney(Math.round(parseFloat(reciboInput.value) || 0), total)) : 0;
      modal.remove();
      onConfirm(pagos, cambio);
    });
  },


  // Modal de abono parcial: permite 0 < monto <= saldo (a diferencia del pago total)
  mostrarModalAbono({ saldo, titulo, onConfirm }) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    let metodosHtml = '';
    this.METODOS_PAGO.forEach(m => {
      metodosHtml += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:8px 10px;background:var(--primary-bg-light);border-radius:8px;">
        <span style="font-size:1.3rem;">${m.icon}</span>
        <span style="flex:1;font-weight:600;">${m.label}</span>
        <input id="abonoMonto_${m.id}" type="number" min="0" step="100" value="0" style="width:130px;text-align:right;font-weight:700;font-size:1rem;padding:8px;">
      </div>`;
    });
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:440px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:5px;">${titulo}</h3>
      <div style="font-size:1.6rem;font-weight:800;color:var(--primary-dark);margin:10px 0 5px;padding:10px;background:var(--primary-bg);border-radius:12px;text-align:center;">Saldo: ${this.fmt(saldo)}</div>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:15px;">Puede abonar cualquier valor hasta el saldo. Se acumula con los pagos anteriores.</p>
      ${metodosHtml}
      <hr style="border-color:var(--primary-border);margin:15px 0;">
      <div style="display:flex;justify-content:space-between;font-size:1.1rem;margin-bottom:8px;">
        <span>Abonado:</span><span id="abonoAsignado" style="font-weight:700;">${this.fmt(0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:1.1rem;margin-bottom:8px;">
        <span>Quedaría pendiente:</span><span id="abonoRestante" style="font-weight:700;">${this.fmt(saldo)}</span>
      </div>
      <div id="abonoEstadoMsg" style="font-size:0.9rem;margin-bottom:15px;min-height:24px;"></div>
      <div class="actions" style="margin-bottom:0;">
        <button id="btnConfirmarAbono" class="btn btn-success" style="flex:1;font-size:1.1rem;padding:14px;" disabled type="button">💰 Abonar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const asignadoSpan = document.getElementById('abonoAsignado');
    const restanteSpan = document.getElementById('abonoRestante');
    const estadoMsg = document.getElementById('abonoEstadoMsg');
    const btnConfirmar = document.getElementById('btnConfirmarAbono');
    const actualizar = () => {
      let asignado = 0;
      this.METODOS_PAGO.forEach(m => { asignado = this.sumMoney(asignado, Math.round(parseFloat(document.getElementById(`abonoMonto_${m.id}`)?.value) || 0)); });
      asignadoSpan.textContent = this.fmt(asignado);
      restanteSpan.textContent = this.fmt(Math.max(0, this.subMoney(saldo, asignado)));
      if (asignado <= 0) {
        estadoMsg.innerHTML = '<span style="color:var(--text-muted);">Ingrese el valor a abonar</span>';
        btnConfirmar.disabled = true; btnConfirmar.textContent = '💰 Abonar';
      } else if (asignado > saldo + 0.01) {
        estadoMsg.innerHTML = `<span style="color:var(--danger);font-weight:600;">⚠️ Supera el saldo pendiente (${this.fmt(saldo)})</span>`;
        btnConfirmar.disabled = true; btnConfirmar.textContent = '💰 Supera el saldo';
      } else if (Math.abs(asignado - saldo) <= 0.01) {
        estadoMsg.innerHTML = '<span style="color:var(--success);font-weight:600;">✔ Con este abono la cuenta queda pagada</span>';
        btnConfirmar.disabled = false; btnConfirmar.textContent = `💰 Abonar ${this.fmt(asignado)} (cierra)`;
      } else {
        estadoMsg.innerHTML = `<span style="color:var(--info-text);font-weight:600;">Quedarían pendientes ${this.fmt(saldo - asignado)}</span>`;
        btnConfirmar.disabled = false; btnConfirmar.textContent = `💰 Abonar ${this.fmt(asignado)}`;
      }
    };
    this.METODOS_PAGO.forEach(m => {
      const el = document.getElementById(`abonoMonto_${m.id}`);
      if (el) el.addEventListener('input', actualizar);
    });
    btnConfirmar.addEventListener('click', () => {
      const pagos = [];
      this.METODOS_PAGO.forEach(m => {
        const monto = Math.round(parseFloat(document.getElementById(`abonoMonto_${m.id}`)?.value) || 0);
        if (monto > 0) pagos.push({ metodoPago: m.id, monto });
      });
      if (!pagos.length) return;
      modal.remove();
      onConfirm(pagos);
    });
  },


  mostrarModalPrompt({ titulo, placeholder, onConfirm }) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="color:var(--primary);margin-bottom:15px;">${this.escapeHtml(titulo)}</h3>
      <div class="form-group"><input id="modalPromptInput" type="text" placeholder="${this.escapeHtml(placeholder || '')}" style="width:100%;padding:10px;font-size:1rem;border:2px solid var(--primary-border);border-radius:8px;" autofocus></div>
      <div class="actions" style="margin-bottom:0;">
        <button class="btn btn-success" data-action="confirmar-modal-prompt" type="button">Guardar</button>
        <button class="btn btn-secondary" data-action="cancelar-modal-prompt" type="button">Cancelar</button>
      </div>
    </div>`;
    modal.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); modal.querySelector('[data-action="confirmar-modal-prompt"]')?.click(); } if (e.key === 'Escape') this.cerrarModal(); });
    modal.addEventListener('click', e => { if (e.target === modal) this.cerrarModal(); });
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('modalPromptInput')?.focus(), 100);
    this._confirmarPromptCallback = onConfirm;
  },


  showMessage(id, text, type) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) { console.warn('showMessage: element not found', id); return; }
    const safeText = this.escapeHtml ? this.escapeHtml(text) : String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
    const safeType = this.escapeHtml ? this.escapeHtml(type) : type;
    el.innerHTML = `<div class="message ${safeType}">${safeText}</div>`;
    if (type !== 'error') setTimeout(() => { el.innerHTML = ''; }, 5000);
  },


  cerrarModal() {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  },

  mostrarModal(html) {
    this.cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
    modal.innerHTML = `<div style="background:#FFFFFF;color:#1E293B;border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);">${html}<div id="modalMsg" aria-live="polite"></div></div>`;
    modal.addEventListener('click', e => { if (e.target === modal) this.cerrarModal(); });
    document.body.appendChild(modal);
  },


  loadingSpinner(containerOrId, show) {
    const el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!el) return;
    if (show) {
      el.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div><p style="margin-top:10px;color:var(--text-muted);">Cargando...</p></div>';
    } else {
      if (el.querySelector('.spinner')) el.innerHTML = '';
    }
  }
});
