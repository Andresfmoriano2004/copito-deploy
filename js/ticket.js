/**
 * Módulo de Tickets e Impresión Térmica POS (58mm / 80mm)
 * Dark Pink Coffee - Copito
 */

const Ticket = {
  config: {
    nombreNegocio: 'Dark Pink Coffee',
    subtitulo: 'Cafetería & Pastelería Artesanal',
    nit: 'NIT: 901.234.567-8',
    direccion: 'Calle Principal # 10-20',
    telefono: 'Tel: 300 123 4567',
    mensajePie: '¡Gracias por su visita!',
    pieSecundario: 'Vuelva pronto ☕'
  },

  fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  },

  formatearFecha(fechaStr) {
    // Consistente con App.fmtFechaHora: MySQL wall-time Bogotá, DD/MM/YYYY hh:mm AM/PM.
    // Usa campos preformateados del backend cuando existen (ya vienen Bogotá, no re-parsear).
    if (fechaStr && typeof fechaStr === 'object') {
      if (fechaStr.fechaHoraCierre) return fechaStr.fechaHoraCierre;
      if (fechaStr.fechaHoraCreacion) return fechaStr.fechaHoraCreacion;
      if (fechaStr.fechaHora) return fechaStr.fechaHora;
      fechaStr = fechaStr.fechaCierreISO || fechaStr.fechaCreacionISO || fechaStr.fechaCierre || fechaStr.fechaCreacion || null;
    }
    const norm = (s) => String(s).toUpperCase().replace(/\s*A\.\s*M\./g, ' AM').replace(/\s*P\.\s*M\./g, ' PM').replace(/\s+/g, ' ').trim();
    const conTZ = (d) => {
      const f = d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
      const h = norm(d.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true }));
      return f + ' ' + h;
    };
    if (!fechaStr) return conTZ(new Date());
    const s = String(fechaStr).trim();
    // Ya viene DD/MM/YYYY [hh:mm AM/PM] del backend: devolver tal cual, sin re-parsear
    // (new Date("07/09/2026") lo lee como MM/DD y pierde la hora -> 12:00 AM).
    if (/^\d{2}\/\d{2}\/\d{4}(\s+\d{1,2}:\d{2}(\s*[AP]M)?)?$/i.test(s)) return norm(s);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return conTZ(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : conTZ(d);
  },

  /**
   * Genera el HTML del ticket optimizado para tirilla térmica
   */
  generarHTML(pedido, opciones = {}) {
    const esComanda = opciones.tipo === 'comanda';
    const cuentaFiltro = opciones.cuenta || null;
    const items = (pedido.items || []).filter(it => {
      if (!cuentaFiltro) return true;
      return it.cuenta === cuentaFiltro;
    });

    const totalCalculado = items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    const totalMostrar = cuentaFiltro ? totalCalculado : Number(pedido.total || totalCalculado);

    // Efectivo: lo que da el cliente y lo que se devuelve. El total NO se modifica.
    // cambio = recibido - total (viene en opciones al cerrar; 0 en transferencia/reimpresión).
    const cambioNum = Number(opciones.cambio ?? pedido.cambio ?? 0) || 0;
    const vueltoHtml = (!esComanda && cambioNum > 0.005) ? `
          <div class="ticket-row-flex">
            <span>Recibido:</span>
            <span>${this.fmt(totalMostrar + cambioNum)}</span>
          </div>
          <div class="ticket-row-flex">
            <span>Cambio:</span>
            <span>${this.fmt(cambioNum)}</span>
          </div>` : '';

    let itemsHtml = '';
    items.forEach(it => {
      const cant = Number(it.cantidad || 1);
      const pu = Number(it.precio_unitario || it.precioUnitario || 0);
      const st = Number(it.subtotal || cant * pu);
      const cuentaBadge = it.cuenta ? `<span class="ticket-cuenta-tag">[Cta ${it.cuenta}]</span> ` : '';

      if (esComanda) {
        itemsHtml += `
          <div class="ticket-row-item ticket-row-comanda">
            <span class="ticket-qty ticket-qty-comanda">${cant}x</span>
            <span class="ticket-name ticket-name-comanda">${cuentaBadge}${this.escapeHtml(it.nombre_producto || it.nombre)}</span>
            ${it.notas ? `<div class="ticket-item-nota ticket-nota-comanda">${this.escapeHtml(it.notas)}</div>` : ''}
          </div>
        `;
      } else {
        itemsHtml += `
          <div class="ticket-row-item">
            <div class="ticket-item-top">
              <span class="ticket-qty">${cant}x</span>
              <span class="ticket-name">${cuentaBadge}${this.escapeHtml(it.nombre_producto || it.nombre)}</span>
              <span class="ticket-price">${this.fmt(st)}</span>
            </div>
            ${cant > 1 ? `<div class="ticket-item-sub">(${cant} x ${this.fmt(pu)})</div>` : ''}
            ${it.notas ? `<div class="ticket-item-nota">Nota: ${this.escapeHtml(it.notas)}</div>` : ''}
          </div>
        `;
      }
    });

    // Métodos de pago
    let pagosHtml = '';
    if (!esComanda && pedido.pagos && pedido.pagos.length > 0) {
      pagosHtml = `
        <div class="ticket-divider"></div>
        <div class="ticket-section-title">Forma(s) de Pago</div>
        ${pedido.pagos.map(p => `
          <div class="ticket-row-flex">
            <span>${p.metodo_pago || p.metodoPago || 'Pago'} ${p.cuenta ? `(Cta ${p.cuenta})` : ''}</span>
            <span>${this.fmt(p.monto)}</span>
          </div>
        `).join('')}
      `;
    } else if (!esComanda && pedido.metodoPago) {
      pagosHtml = `
        <div class="ticket-divider"></div>
        <div class="ticket-row-flex">
          <span>Método de Pago:</span>
          <strong>${this.escapeHtml(pedido.metodoPago)}</strong>
        </div>
      `;
    }

    return `
      <div class="ticket-container" id="ticketPrintArea">
        <div class="ticket-header">
          <div class="ticket-brand">${this.config.nombreNegocio}</div>
          <div class="ticket-sub">${this.config.subtitulo}</div>
          <div class="ticket-info">${this.config.nit}</div>
          <div class="ticket-info">${this.config.direccion}</div>
          <div class="ticket-info">${this.config.telefono}</div>
          <div class="ticket-divider-double"></div>
          <div class="ticket-type-title">${esComanda ? '*** COMANDA DE PREPARACIÓN ***' : (cuentaFiltro ? `*** RECIBO CUENTA ${cuentaFiltro} ***` : '*** FACTURA DE VENTA ***')}</div>
        </div>

        <div class="ticket-meta">
          <div class="ticket-row-flex">
            <span>Pedido: <strong>#${pedido.id || pedido.id_pedido}</strong></span>
            <span>${this.formatearFecha(pedido.fechaHoraCierre || pedido.fechaHoraCreacion || pedido.fechaCierre || pedido.fechaCreacion || pedido)}</span>
          </div>
          <div class="ticket-row-flex">
            <span>Lugar: <strong>${this.escapeHtml(pedido.lugar || 'General')}</strong></span>
            ${pedido.vendedor ? `<span>Vendedor: ${this.escapeHtml(pedido.vendedor)}</span>` : ''}
          </div>
          ${pedido.cliente ? `
            <div class="ticket-row-flex">
              <span>Cliente: <strong>${this.escapeHtml(pedido.cliente)}</strong></span>
            </div>
          ` : ''}
        </div>

        <div class="ticket-divider"></div>

        <div class="ticket-items">
          ${itemsHtml || '<div style="text-align:center;color:#666;">Sin ítems</div>'}
        </div>

        ${!esComanda ? `
          <div class="ticket-divider"></div>
          <div class="ticket-row-total">
            <span>TOTAL:</span>
            <span>${this.fmt(totalMostrar)}</span>
          </div>
          ${pagosHtml}
          ${vueltoHtml}
        ` : ''}

        ${pedido.notas ? `
          <div class="ticket-divider"></div>
          <div class="ticket-notas">
            <strong>Observaciones:</strong><br>${this.escapeHtml(pedido.notas)}
          </div>
        ` : ''}

        ${!esComanda ? `
        <div class="ticket-footer">
          <div class="ticket-divider-double"></div>
          <div class="ticket-bye">${this.config.mensajePie}</div>
          <div class="ticket-bye-sub">${this.config.pieSecundario}</div>
        </div>` : `
        <div class="ticket-footer">
          <div class="ticket-divider-double"></div>
          <div class="ticket-bye" style="font-size:0.7rem;opacity:0.6;">Preparación interna</div>
        </div>`}
      </div>
    `;
  },

  /**
   * Muestra el modal interactivo con la vista previa del ticket
   */
  async mostrarModal(pedidoIdOrObject, opciones = {}) {
    let pedido = pedidoIdOrObject;
    if (typeof pedidoIdOrObject === 'string' || typeof pedidoIdOrObject === 'number') {
      try {
        pedido = await obtenerPedido(pedidoIdOrObject);
      } catch (e) {
        alert('Error al cargar datos del pedido para ticket: ' + e.message);
        return;
      }
    }

    let modal = document.getElementById('ticketPreviewModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ticketPreviewModal';
      modal.className = 'ticket-modal';
      document.body.appendChild(modal);
    }

    const ticketHtml = this.generarHTML(pedido, opciones);

    modal.innerHTML = `
      <div class="ticket-modal-content">
        <div class="ticket-modal-header">
          <h3>🖨️ Vista Previa de Ticket</h3>
          <button class="ticket-modal-close" onclick="Ticket.cerrarModal()">&times;</button>
        </div>
        <div class="ticket-modal-body">
          <div class="ticket-paper-preview">
            ${ticketHtml}
          </div>
        </div>
        <div class="ticket-modal-actions">
          <button class="btn btn-outline" onclick="Ticket.cerrarModal()">Cerrar</button>
          <button class="btn btn-secondary" onclick="Ticket.cambiarVistaModal('comanda')">🍽️ Ver Comanda</button>
          <button class="btn btn-secondary" onclick="Ticket.cambiarVistaModal('recibo')">🧾 Ver Recibo</button>
          <button class="btn btn-primary" onclick="Ticket.imprimirActual()">🖨️ Imprimir</button>
        </div>
      </div>
    `;

    modal.dataset.currentPedido = JSON.stringify(pedido);
    modal.dataset.currentOptions = JSON.stringify(opciones);
    modal.classList.add('active');
  },

  cambiarVistaModal(tipo) {
    const modal = document.getElementById('ticketPreviewModal');
    if (!modal || !modal.dataset.currentPedido) return;
    const pedido = JSON.parse(modal.dataset.currentPedido);
    const opciones = JSON.parse(modal.dataset.currentOptions || '{}');
    opciones.tipo = tipo === 'comanda' ? 'comanda' : 'recibo';
    this.mostrarModal(pedido, opciones);
  },

  cerrarModal() {
    const modal = document.getElementById('ticketPreviewModal');
    if (modal) modal.classList.remove('active');
  },

  imprimirActual() {
    window.print();
  },

  /**
   * Imprime directamente un pedido sin abrir diálogo previo si se desea
   */
  async imprimir(pedidoIdOrObject, opciones = {}) {
    await this.mostrarModal(pedidoIdOrObject, opciones);
    setTimeout(() => {
      window.print();
    }, 250);
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
};

window.Ticket = Ticket;
