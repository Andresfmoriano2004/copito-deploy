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

  /**
   * Importes a 2 decimales. El comprobante SÍ los necesita: el total es la
   * suma exacta de base + IVA por línea, y redondear aquí haría que la
   * factura no cuadrara con lo cobrado.
   */
  fmt2(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  /** 901234567 + dv 8 → 901.234.567-8 (mismo agrupado que el backend). */
  fmtId(numero, dv) {
    const d = String(numero == null ? '' : numero).replace(/\D/g, '');
    if (!d) return '';
    const g = d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const v = String(dv == null ? '' : dv).replace(/\D/g, '');
    return v ? `${g}-${v}` : g;
  },

  /**
   * Datos del emisor en un formato único para el ticket.
   * Sale de `pedido.empresa` (configuración fiscal real, v9) y, si el pedido
   * no la trae —una demo o una corrida sin migrar—, cae a la configuración
   * de este archivo para no dejar el encabezado vacío.
   */
  emisor(pedido) {
    const e = pedido && pedido.empresa;
    if (!e || !e.nombre) {
      return {
        nombre: this.config.nombreNegocio, razon: '',
        subtitulo: this.config.subtitulo, nit: this.config.nit,
        direccion: this.config.direccion, telefono: this.config.telefono,
        regimen: '', actividad: '',
        pie: this.config.mensajePie, pie2: this.config.pieSecundario
      };
    }
    return {
      nombre: e.nombre,
      razon: (e.razon && e.razon !== e.nombre) ? e.razon : '',
      subtitulo: e.subtitulo || '',
      nit: e.nit ? `NIT: ${this.fmtId(e.nit, e.dv)}` : '',
      direccion: [e.direccion, e.ciudad].filter(Boolean).join(' · '),
      telefono: e.telefono ? `Tel: ${e.telefono}` : '',
      regimen: e.regimen ? `Régimen: ${e.regimen}` : '',
      actividad: e.actividad ? `Actividad econ.: ${e.actividad}` : '',
      pie: e.pie || this.config.mensajePie,
      pie2: e.pie2 || this.config.pieSecundario
    };
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

    const em = this.emisor(pedido);

    // Solo el pedido con comprobante EMITIDO es una FACTURA. A un pedido
    // abierto o a la cocina no se le pone ese rótulo: sería un documento sin
    // consecutivo. Ver sql/migracion_v9_facturacion.sql (Camino A).
    const factura = (!esComanda && !cuentaFiltro) ? (pedido.factura || null) : null;
    const esFactura = !!factura;
    const anulada = esFactura && factura.estado === 'Anulada';
    const totales = pedido.totales || null;

    // Los comprobantes llevan centavos (base + IVA deben sumar el total
    // exacto); el ticket simple sigue mostrando pesos enteros como antes.
    const fmtMoney = (n) => esFactura ? this.fmt2(n) : this.fmt(n);

    const titulo = esComanda ? '*** COMANDA DE PREPARACIÓN ***'
      : cuentaFiltro ? `*** RECIBO CUENTA ${cuentaFiltro} ***`
      : esFactura ? '*** FACTURA DE VENTA ***'
      : '*** TICKET DE VENTA ***';

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
        // La receta del producto (v10) viaja en `opciones.pasos`, ya traída
        // por mostrarModal(). Sin ella la comanda se imprime igual: la cocina
        // no se queda sin ticket porque falle la carga de una receta.
        const cod = it.codigo || it.codigo_producto || it.codigoProducto;
        const receta = (cod && opciones.pasos && opciones.pasos[cod]) || [];
        const pasosHtml = receta.length ? `
            <div class="ticket-receta">
              ${receta.map((p, i) => `
                <div class="ticket-paso">
                  <span class="ticket-paso-n">${i + 1}.</span>
                  <span class="ticket-paso-txt">${this.escapeHtml(p.instruccion)}${p.tiempoMin ? `<strong class="ticket-paso-tiempo"> (${p.tiempoMin} min${p.equipo ? ' · ' + this.escapeHtml(p.equipo) : ''})</strong>` : ''}</span>
                </div>`).join('')}
            </div>` : '';
        itemsHtml += `
          <div class="ticket-row-item ticket-row-comanda">
            <span class="ticket-qty ticket-qty-comanda">${cant}x</span>
            <span class="ticket-name ticket-name-comanda">${cuentaBadge}${this.escapeHtml(it.nombre_producto || it.nombre)}</span>
            ${pasosHtml}
            ${it.notas ? `<div class="ticket-item-nota ticket-nota-comanda">${this.escapeHtml(it.notas)}</div>` : ''}
          </div>
        `;
      } else {
        const pctIva = Number(it.ivaPorcentaje || 0);
        const fiscal = esFactura && pctIva > 0;
        itemsHtml += `
          <div class="ticket-row-item">
            <div class="ticket-item-top">
              <span class="ticket-qty">${cant}x</span>
              <span class="ticket-name">${cuentaBadge}${this.escapeHtml(it.nombre_producto || it.nombre)}</span>
              <span class="ticket-price">${fmtMoney(st)}</span>
            </div>
            ${esFactura
              ? `<div class="ticket-item-sub">${cant} ${this.escapeHtml(it.unidad || 'Und')} · c/u ${this.fmt2(pu)}</div>`
              : (cant > 1 ? `<div class="ticket-item-sub">(${cant} x ${this.fmt(pu)})</div>` : '')}
            ${fiscal ? `<div class="ticket-item-fiscal">Base ${this.fmt2(it.baseGravable)} · IVA ${pctIva}% ${this.fmt2(it.ivaValor)}</div>` : ''}
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

    // ── ④ Cliente ─────────────────────────────────────────────────────
    // El comprobante necesita identificar al adquirente. Si no se capturó
    // nada, el texto legal es "CONSUMIDOR FINAL".
    let clienteHtml = '';
    if (esFactura) {
      const cf = pedido.clienteFiscal || {};
      const nitCli = cf.nit ? this.fmtId(cf.nit, cf.dv) : '';
      const nombre = pedido.cliente || '';
      const consumidorFinal = !nombre && !nitCli;
      const fila = (etiqueta, valor) => valor
        ? `<div class="ticket-row-flex"><span>${etiqueta}:</span><span>${this.escapeHtml(valor)}</span></div>`
        : '';
      clienteHtml = `
        <div class="ticket-divider"></div>
        <div class="ticket-section-title">Cliente</div>
        ${consumidorFinal
          ? '<div class="ticket-row-flex"><span>Nombre:</span><span>CONSUMIDOR FINAL</span></div>'
          : fila('Nombre', nombre || 'Sin nombre')
            + fila('NIT/C.C.', nitCli)
            + fila('Dirección', cf.direccion)
            + fila('Email', cf.email)
            + fila('Régimen', cf.regimen)}
      `;
    }

    // ── ⑥ Totales ─────────────────────────────────────────────────────
    let totalesHtml = '';
    if (!esComanda) {
      if (esFactura && totales) {
        // SUBTOTAL es la base imponible (precio sin IVA): es lo que suman
        // las líneas y por eso SUBTOTAL + IVA == TOTAL al centavo.
        const pcts = [...new Set(items.map(i => Number(i.ivaPorcentaje || 0)).filter(v => v > 0))]
          .sort((a, b) => a - b);
        const etiquetaIva = pcts.length === 1 ? `IVA ${pcts[0]}%:` : (pcts.length ? 'IVA:' : '');
        const desc = Number(totales.descuentos || 0);
        totalesHtml = `
          <div class="ticket-divider"></div>
          <div class="ticket-row-flex"><span>Subtotal:</span><span>${this.fmt2(totales.base)}</span></div>
          ${desc > 0.005
            ? `<div class="ticket-row-flex"><span>Descuentos:</span><span>-${this.fmt2(desc)}</span></div>`
            : ''}
          ${etiquetaIva && Number(totales.iva) > 0.005
            ? `<div class="ticket-row-flex"><span>${etiquetaIva}</span><span>${this.fmt2(totales.iva)}</span></div>`
            : ''}
          <div class="ticket-row-total"><span>TOTAL:</span><span>${this.fmt2(totalMostrar)}</span></div>
          ${factura.formaPago
            ? `<div class="ticket-row-flex"><span>Forma de pago:</span><strong>${this.escapeHtml(factura.formaPago)}</strong></div>`
            : ''}
        `;
      } else {
        totalesHtml = `
          <div class="ticket-divider"></div>
          <div class="ticket-row-total">
            <span>TOTAL:</span>
            <span>${this.fmt(totalMostrar)}</span>
          </div>`;
      }
    }

    return `
      <div class="ticket-container" id="ticketPrintArea">
        <div class="ticket-header">
          <div class="ticket-brand">${this.escapeHtml(em.nombre)}</div>
          ${em.razon ? `<div class="ticket-sub">${this.escapeHtml(em.razon)}</div>` : ''}
          ${em.subtitulo ? `<div class="ticket-sub">${this.escapeHtml(em.subtitulo)}</div>` : ''}
          ${em.nit ? `<div class="ticket-info">${this.escapeHtml(em.nit)}</div>` : ''}
          ${em.direccion ? `<div class="ticket-info">${this.escapeHtml(em.direccion)}</div>` : ''}
          ${em.telefono ? `<div class="ticket-info">${this.escapeHtml(em.telefono)}</div>` : ''}
          ${em.regimen ? `<div class="ticket-info">${this.escapeHtml(em.regimen)}</div>` : ''}
          ${em.actividad ? `<div class="ticket-info">${this.escapeHtml(em.actividad)}</div>` : ''}
          <div class="ticket-divider-double"></div>
          <div class="ticket-type-title">${titulo}</div>
          ${esFactura ? `<div class="ticket-folio">No. ${this.escapeHtml(factura.numero)}</div>` : ''}
          ${esFactura && factura.resolucion
            ? `<div class="ticket-info">Resolución ${this.escapeHtml(factura.resolucion)}</div>` : ''}
          ${anulada
            ? `<div class="ticket-folio ticket-folio-anulada">*** ANULADA ***${factura.anuladaMotivo
                ? ` — ${this.escapeHtml(factura.anuladaMotivo)}` : ''}</div>` : ''}
        </div>

        <div class="ticket-meta">
          <div class="ticket-row-flex">
            <span>Pedido: <strong>#${pedido.id || pedido.id_pedido}</strong></span>
            <span>${this.formatearFecha(esFactura && (factura.fechaEmisionFmt || factura.fechaEmision)
                  ? (factura.fechaEmisionFmt || factura.fechaEmision)
                  : (pedido.fechaHoraCierre || pedido.fechaHoraCreacion || pedido.fechaCierre || pedido.fechaCreacion || pedido))}</span>
          </div>
          <div class="ticket-row-flex">
            <span>Lugar: <strong>${this.escapeHtml(pedido.lugar || 'General')}</strong></span>
            ${pedido.vendedor ? `<span>Vendedor: ${this.escapeHtml(pedido.vendedor)}</span>` : ''}
          </div>
          ${!esFactura && pedido.cliente ? `
            <div class="ticket-row-flex">
              <span>Cliente: <strong>${this.escapeHtml(pedido.cliente)}</strong></span>
            </div>
          ` : ''}
        </div>

        ${clienteHtml}

        <div class="ticket-divider"></div>

        <div class="ticket-items">
          ${itemsHtml || '<div style="text-align:center;color:var(--text-muted);">Sin ítems</div>'}
        </div>

        ${totalesHtml}
        ${!esComanda ? `
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
          <div class="ticket-bye">${this.escapeHtml(em.pie)}</div>
          <div class="ticket-bye-sub">${this.escapeHtml(em.pie2)}</div>
        </div>` : `
        <div class="ticket-footer">
          <div class="ticket-divider-double"></div>
          <div class="ticket-bye" style="font-size:0.7rem;opacity:0.6;">Preparación interna</div>
        </div>`}
      </div>
    `;
  },

  /**
   * Recetas (paso a paso) de los productos de un pedido, como mapa
   * { CodigoProducto: [paso, …] }.
   *
   * Nunca tira la comanda: si la carga falla devuelve `{}` y cocina recibe el
   * ticket con los productos y sin receta, que es mejor que no recibir nada.
   */
  async cargarPasos(pedido) {
    try {
      const items = (pedido && pedido.items) || [];
      const codigos = [...new Set(items.map(i => i.codigo || i.codigo_producto || i.codigoProducto).filter(Boolean))];
      if (!codigos.length) return {};
      const mapa = {};
      await Promise.all(codigos.map(async c => {
        const r = await apiGet('/receta-pasos/' + encodeURIComponent(c));
        if (Array.isArray(r) && r.length) mapa[c] = r;
      }));
      return mapa;
    } catch (e) {
      console.warn('Ticket: no se pudo cargar la preparación', e);
      return {};
    }
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

    // Solo la comanda lleva la receta. Se guarda en `opciones` para que al
    // alternar recibo ↔ comanda desde el modal no se vuelva a pedir.
    if (opciones.tipo === 'comanda' && !opciones.pasos) {
      opciones = { ...opciones, pasos: await this.cargarPasos(pedido) };
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
