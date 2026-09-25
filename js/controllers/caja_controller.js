// Copito POS — Controller for cash register.
// Mediates between CajaView (templates) and API functions.
const CajaController = {

  init() {
    Store.subscribe('caja', () => this.render());
  },

  async cargarCaja() {
    const container = document.querySelector('#caja .content-body');
    try {
      const caja = await obtenerCajaActiva();
      if (!caja) {
        Store.set('caja.isOpen', false);
        Store.set('caja.resumen', null);
        await this._renderCerrada();
        return;
      }
      Store.set('caja.isOpen', true);
      const [resumen, propinas] = await Promise.all([obtenerResumenCaja(), obtenerPropinasCaja()]);
      Store.set('caja.resumen', resumen);
      Store.set('caja.propinas', propinas);
      await this._renderAbierta(caja, resumen, propinas);
    } catch (err) {
      // #cajaMsg puede no existir si el fallo ocurrió antes de renderizar:
      // pintar el error en el contenedor para nunca dejar la pestaña en blanco.
      if (container) {
        container.innerHTML = `<div class="message error">Error al cargar caja: ${App.escapeHtml(err.message)}<div class="actions" style="margin-top:10px;margin-bottom:0;"><button class="btn btn-primary" data-action="refresh-caja" type="button">🔄 Reintentar</button></div></div>`;
        this._bindCajaEvents();
      } else {
        App.showMessage('cajaMsg', 'Error al cargar caja: ' + err.message, 'error');
      }
    }
  },

  async _renderCerrada() {
    const container = document.querySelector('#caja .content-body');
    if (!container) return;
    const aperturaHtml = CajaView.aperturaForm('<div id="cajaMsg"></div>');
    const historialHtml = '<div id="cajaHistorial"><div class="loading"><div class="spinner"></div><p>Cargando historial...</p></div></div>';
    container.innerHTML = CajaView.cerrada(aperturaHtml, historialHtml);
    this._bindCajaEvents();
    await this.cargarHistorialCaja();
  },

  async _renderAbierta(caja, resumen, propinas) {
    const container = document.querySelector('#caja .content-body');
    if (!container) return;
    container.innerHTML = CajaView.abierta(caja, resumen, propinas);
    this._bindCajaEvents();
  },

  _bindCajaEvents() {
    const container = document.querySelector('#caja .content-body');
    if (!container || container._ctrlBound) return;
    container._ctrlBound = true;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'abrir-caja') { this.abrirCajaHandler(); return; }
      if (action === 'registrar-mov-caja') { this.registrarMovCaja(); return; }
      if (action === 'cerrar-caja-modal') { this.cerrarCajaModal(); return; }
      if (action === 'confirmar-cierre-caja') { this.confirmarCierreCaja(); return; }
      if (action === 'propina-general') { PedidosController.mostrarModalPropinaGeneral(); return; }
      if (action === 'refresh-caja') { this.cargarCaja(); return; }
    });
  },

  async abrirCajaHandler() {
    const monto = parseFloat(document.getElementById('cajaMontoInicial')?.value);
    if (!monto || monto < 0) { App.showMessage('cajaMsg', 'Ingrese un monto inicial válido', 'error'); return; }
    try {
      await abrirCaja(monto);
      App.showMessage('cajaMsg', 'Caja abierta exitosamente', 'success');
      await this.cargarCaja();
    } catch (err) {
      App.showMessage('cajaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async registrarMovCaja() {
    const tipo = document.getElementById('cajaMovTipo')?.value;
    const metodoPago = document.getElementById('cajaMovMetodo')?.value;
    const monto = parseFloat(document.getElementById('cajaMovMonto')?.value);
    const descripcion = document.getElementById('cajaMovDesc')?.value?.trim();
    if (!tipo || !metodoPago || !monto || !descripcion) { App.showMessage('cajaMovMsg', 'Complete todos los campos', 'error'); return; }
    try {
      await registrarMovimientoCaja({ tipo, metodoPago, monto, descripcion });
      App.showMessage('cajaMovMsg', 'Movimiento registrado', 'success');
      document.getElementById('cajaMovMonto').value = '';
      document.getElementById('cajaMovDesc').value = '';
      await this.cargarCaja();
    } catch (err) {
      App.showMessage('cajaMovMsg', 'Error: ' + err.message, 'error');
    }
  },

  async cerrarCajaModal() {
    try {
      const resumen = await obtenerResumenCaja();
      App.cerrarModal();
      const html = CajaView.cerrarModal(resumen);
      App.mostrarModal(html);
      // Diferencia en vivo mientras se escribe el conteo físico
      const esperado = resumen.totalFisico || 0;
      const fisInput = document.getElementById('cajaMontoFisico');
      const updDif = () => {
        const fisico = parseFloat(fisInput?.value) || 0;
        const dif = App.roundMoney(fisico - esperado);
        const valEl = document.getElementById('cajaDifValor');
        const boxEl = document.getElementById('cajaDifBox');
        const msgEl = document.getElementById('cajaDifMsg');
        if (valEl) valEl.textContent = App.fmt(dif);
        if (msgEl) msgEl.textContent = dif === 0 ? 'Cuadre exacto ✔' : (dif < 0 ? `Faltante: ${App.fmt(Math.abs(dif))}` : `Sobrante: ${App.fmt(dif)}`);
        if (boxEl) {
          boxEl.classList.remove('caja-dif-ok', 'caja-dif-faltante', 'caja-dif-sobrante');
          boxEl.classList.add(dif === 0 ? 'caja-dif-ok' : (dif < 0 ? 'caja-dif-faltante' : 'caja-dif-sobrante'));
        }
      };
      fisInput?.addEventListener('input', updDif);
      updDif();
    } catch (err) {
      App.showMessage('cajaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async confirmarCierreCaja() {
    const montoFisico = parseFloat(document.getElementById('cajaMontoFisico')?.value);
    const notas = document.getElementById('cajaNotas')?.value?.trim() || '';
    if (montoFisico === undefined || isNaN(montoFisico)) { App.showMessage('cajaMsg', 'Ingrese el conteo físico', 'error'); return; }
    const resumen = Store.get('caja.resumen');
    if (resumen) {
      const dif = App.roundMoney(montoFisico - resumen.totalFisico);
      if (dif < -1000) {
        if (!confirm(`⚠️ Diferencia negativa de ${App.fmt(dif)}. ¿Confirmar cierre?`)) return;
      }
    }
    try {
      await cerrarCaja({ montoFisico, notas });
      App.cerrarModal();
      App.showMessage('cajaMsg', 'Caja cerrada exitosamente', 'success');
      await this.cargarCaja();
    } catch (err) {
      App.showMessage('cajaMsg', 'Error: ' + err.message, 'error');
    }
  },

  async cargarHistorialCaja() {
    const el = document.getElementById('cajaHistorial');
    if (!el) return;
    try {
      const rows = await obtenerHistorialCaja();
      el.innerHTML = CajaView.historial(rows);
    } catch (err) {
      el.innerHTML = '<div class="message error">Error al cargar historial</div>';
    }
  },

  render() {
    // Explicit render — called after state changes
  }
};
