// ─── Recetas module ─────────────────────────────────────────────────────────
//
// Dos cosas distintas conviven en esta pestaña:
//   · `recetas` (v7a)        → CUÁNTO ENTRA de materia prima por unidad
//   · `receta_pasos` (v10)   → CÓMO SE HACE, el procedimiento paso a paso
// Por eso las dos tarjetas: una responde al costo, la otra a la comanda.
Object.assign(App, {
  recetasData: [],
  recetasMP: [],
  recetasProductos: [],
  recetaPasosData: [],   // pasos de preparación de todos los productos
  recetasCostos: [],     // costo teórico por producto (v11)

  // Estado del editor de pasos (un producto = una receta).
  pasosEdit: null,
  pasosCodigo: null,

  getRecetasAgrupadas() {
    const grouped = {};
    this.recetasData.forEach(receta => {
      if (!grouped[receta.codigoProducto]) {
        grouped[receta.codigoProducto] = {
          nombre: receta.productoNombre,
          items: []
        };
      }
      grouped[receta.codigoProducto].items.push(receta);
    });
    return grouped;
  },

  getRecetaStats(items) {
    const productosConReceta = new Set(items.map(item => item.codigoProducto)).size;
    const ingredientesUsados = new Set(items.map(item => item.codigoMateriaPrima)).size;
    const totalLineas = items.length;
    return { productosConReceta, ingredientesUsados, totalLineas };
  },

  async cargarRecetas() {
    const el = document.getElementById('recetasContent');
    if (!el) return;
    el.innerHTML = '<div class="loading"><span class="loading-spinner"></span> Cargando...</div>';
    try {
      const [recetas, mp, prods, pasos] = await Promise.all([
        apiGet('/recetas'),
        apiGet('/materia-prima'),
        apiGet('/productos'),
        apiGet('/receta-pasos')
      ]);
      // El costo teórico es complementario: se pide aparte y a la fuerza se
      // tolera un fallo, para que un error de esa ruta no se lleve por delante
      // las tarjetas de insumos y de pasos.
      const costos = await apiGet('/recetas/costos').catch(() => null);
      this.recetasData = recetas;
      this.recetasMP = mp;
      this.recetasProductos = prods;
      this.recetaPasosData = Array.isArray(pasos) ? pasos : [];
      this.recetasCostos = Array.isArray(costos) ? costos : [];
      this._renderRecetas();
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Error: ${App.escapeHtml(e.message)}</div>`;
    }
  },

  // ─── Preparación: pasos agrupados por producto ────────────────────────────

  /** { CodigoProducto: [paso, paso, …] } siempre ordenados por `orden`. */
  _pasosAgrupados() {
    const g = {};
    (this.recetaPasosData || []).forEach(p => {
      (g[p.codigoProducto] = g[p.codigoProducto] || []).push(p);
    });
    Object.keys(g).forEach(c => g[c].sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    return g;
  },

  _nombreProducto(codigo) {
    const p = (this.recetasProductos || []).find(x => x.codigo === codigo);
    return p ? p.nombre : codigo;
  },

  /** Minutos declarados en la receta de un producto (null si no hay tiempos). */
  _minutosReceta(pasos) {
    const min = (pasos || []).reduce((s, p) => s + Number(p.tiempoMin || 0), 0);
    return min > 0 ? min : null;
  },

  _renderRecetas() {
    const el = document.getElementById('recetasContent');
    if (!el) return;

    const grouped = this.getRecetasAgrupadas();
    const stats = this.getRecetaStats(this.recetasData);

    let html = `
      <div class="card">
        <div class="card-header">Insumos por unidad — cuánto entra</div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${stats.productosConReceta}</div>
              <div class="stat-label">Productos con insumos</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.ingredientesUsados}</div>
              <div class="stat-label">Ingredientes usados</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.totalLineas}</div>
              <div class="stat-label">Líneas de insumo</div>
            </div>
          </div>

          <div class="actions" style="margin-bottom:15px;">
            <button class="btn btn-success" data-action="receta-nueva" type="button">+ Nueva receta de insumos</button>
          </div>`;

    if (!this.recetasData.length) {
      html += `<p class="empty-state">No hay recetas de insumos. Aquí se registra cuánta materia prima consume cada producto por unidad (es lo que alimenta el costo).</p>`;
    } else {
      html += `<div class="table-container"><table class="data-table">
        <thead><tr><th>Producto</th><th>Materia Prima</th><th>Cantidad</th><th>Notas</th><th>Acciones</th></tr></thead>
        <tbody>`;

      Object.entries(grouped).forEach(([codigo, grupo]) => {
        grupo.items.forEach((r, i) => {
          html += `<tr>
            ${i === 0 ? `<td rowspan="${grupo.items.length}" style="font-weight:600;">${this.escapeHtml(grupo.nombre)}</td>` : ''}
            <td>${this.escapeHtml(r.materiaPrimaNombre)} (${this.escapeHtml(r.materiaPrimaUnidad)})</td>
            <td><strong>${Number(r.cantidad || 0)}</strong></td>
            <td>${this.escapeHtml(r.notas || '-')}</td>
            <td>
              <button class="btn btn-sm btn-secondary" data-action="receta-editar" data-id="${r.id}" data-cantidad="${r.cantidad}" data-notas="${this.escapeHtml(r.notas || '')}" type="button">Editar</button>
              <button class="btn btn-sm btn-danger" data-action="receta-eliminar" data-id="${r.id}" type="button">Eliminar</button>
            </td>
          </tr>`;
        });
      });

      html += `</tbody></table></div>`;
    }

    html += `</div></div>` + this._renderCostos() + this._renderPreparacion();

    el.innerHTML = html;
  },

  /**
   * Tarjeta "Costo teórico — cuánto cuesta hacerlo" (v11).
   *
   * `costoTeorico` sale de la receta: Σ(cantidad de cada insumo × su costo).
   * `costoCatalogo` es el número a mano que cargó el administrador en el
   * producto. Cuando discrepan, el registrado quedó desactualizado y la receta
   * es la fuente de verdad.
   */
  _renderCostos() {
    const filas = this.recetasCostos || [];
    if (!filas.length) return '';
    const conReceta = filas.filter(f => f.costoTeorico !== null && f.costoTeorico !== undefined);
    const fmt = n => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 });
    const desf = f => Math.abs(f.costoTeorico - f.costoCatalogo) > 0.01;

    const descuadres = conReceta.filter(desf);
    const conMargen = conReceta.filter(f => f.margenPct !== null && f.margenPct !== undefined);
    const margenMedio = conMargen.length
      ? Math.round(conMargen.reduce((s, f) => s + Number(f.margenPct), 0) / conMargen.length)
      : null;

    let tabla = '';
    if (conReceta.length) {
      tabla = `<div class="table-container"><table class="data-table">
        <thead><tr>
          <th>Producto</th><th>Insumos</th><th>Costo teórico</th>
          <th>Costo registrado</th><th>Precio</th><th>Margen</th>
        </tr></thead><tbody>`;
      conReceta.forEach(f => {
        const ok = !desf(f);
        tabla += `<tr>
          <td style="font-weight:600;">${this.escapeHtml(f.nombre)}</td>
          <td>${f.insumos}</td>
          <td><strong>$${fmt(f.costoTeorico)}</strong></td>
          <td style="${ok ? 'color:var(--text-muted);' : 'color:var(--danger-text);font-weight:600;'}"
              title="${ok ? 'Coincide con la receta' : 'No coincide con la receta: el costo del producto está desactualizado'}">$${fmt(f.costoCatalogo)}${ok ? '' : ' ⚠'}</td>
          <td>$${fmt(f.precio)}</td>
          <td>$${fmt(f.margen)}${f.margenPct !== null && f.margenPct !== undefined ? ` <span style="color:var(--text-muted);">(${f.margenPct}%)</span>` : ''}</td>
        </tr>`;
      });
      tabla += `</tbody></table></div>`;
    } else {
      tabla = `<p class="empty-state">Ningún producto tiene insumos cargados, así que no hay costo teórico
        que calcular. Mientras tanto el inventario se valora con el costo registrado a mano en cada producto.</p>`;
    }

    return `
      <div class="card" style="margin-top:20px;">
        <div class="card-header">Costo teórico — cuánto cuesta hacerlo</div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${conReceta.length}</div>
              <div class="stat-label">Productos con costo teórico</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${descuadres.length}</div>
              <div class="stat-label">Costo registrado desactualizado</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${margenMedio === null ? '—' : margenMedio + '%'}</div>
              <div class="stat-label">Margen medio (sobre precio)</div>
            </div>
          </div>
          ${tabla}
          <p style="color:var(--text-muted);font-size:0.82rem;margin-top:10px;">
            Costo teórico = Σ(cantidad de cada insumo × su costo) por unidad.
            Al vender, esa misma receta es la que descuenta materia prima.
          </p>
        </div>
      </div>`;
  },

  /** Tarjeta "Preparación — receta paso a paso" (v10). */
  _renderPreparacion() {
    const pasos = this._pasosAgrupados();
    const codigos = Object.keys(pasos);
    const totalPasos = (this.recetaPasosData || []).length;
    const minutosTotal = (this.recetaPasosData || []).reduce((s, p) => s + Number(p.tiempoMin || 0), 0);

    const selOpts = (this.recetasProductos || []).map(p =>
      `<option value="${this.escapeHtml(p.codigo)}">${this.escapeHtml(p.nombre)}${pasos[p.codigo] ? ' ✓' : ''}</option>`
    ).join('');

    let tabla = '';
    if (codigos.length) {
      tabla = `<div class="table-container"><table class="data-table">
        <thead><tr>
          <th>Producto</th><th>Pasos</th><th>Tiempo</th><th>Primer paso</th><th>Acciones</th>
        </tr></thead><tbody>`;
      codigos.forEach(c => {
        const lista = pasos[c];
        const min = this._minutosReceta(lista);
        const primero = (lista[0] && lista[0].instruccion) || '';
        const corto = primero.length > 90 ? primero.slice(0, 90) + '…' : primero;
        tabla += `<tr>
          <td style="font-weight:600;">${this.escapeHtml(this._nombreProducto(c))}</td>
          <td>${lista.length}</td>
          <td>${min ? min + ' min' : '—'}</td>
          <td style="color:var(--text-muted);max-width:340px;">${this.escapeHtml(corto)}</td>
          <td>
            <button class="btn btn-sm btn-secondary" data-action="paso-ver" data-codigo="${this.escapeHtml(c)}" type="button">📖 Ver</button>
            <button class="btn btn-sm btn-secondary" data-action="paso-editar" data-codigo="${this.escapeHtml(c)}" type="button">✏️ Editar</button>
            <button class="btn btn-sm btn-danger" data-action="paso-borrar" data-codigo="${this.escapeHtml(c)}" type="button">🗑</button>
          </td>
        </tr>`;
      });
      tabla += `</tbody></table></div>`;
    } else {
      tabla = `<p class="empty-state">Ningún producto tiene preparación escrita todavía.
        Elija un producto y describa cómo se hace, paso a paso: esa receta es la que
        se imprime en la comanda de cocina.</p>`;
    }

    return `
      <div class="card" style="margin-top:20px;">
        <div class="card-header">Preparación — receta paso a paso</div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${codigos.length}</div>
              <div class="stat-label">Productos con preparación</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${totalPasos}</div>
              <div class="stat-label">Pasos escritos</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${minutosTotal ? minutosTotal + ' min' : '—'}</div>
              <div class="stat-label">Tiempo total declarado</div>
            </div>
          </div>

          <div id="recetasMsg"></div>

          <div class="actions" style="margin-bottom:15px;align-items:center;">
            <select id="pasoProductoSel" style="flex:1 1 240px;min-width:200px;max-width:340px;">${selOpts}</select>
            <button class="btn btn-success" data-action="paso-editar-sel" type="button">✏️ Escribir / editar preparación</button>
          </div>

          ${tabla}
        </div>
      </div>`;
  },

  // ─── Editor de pasos ──────────────────────────────────────────────────────

  recetaPasosEditor(codigo) {
    if (!codigo) {
      this.showMessage('recetasMsg', 'Elija un producto primero', 'error');
      return;
    }
    this.pasosCodigo = codigo;
    this.pasosEdit = (this.recetaPasosData || [])
      .filter(p => p.codigoProducto === codigo)
      .map(p => ({
        titulo: p.titulo || '',
        instruccion: p.instruccion || '',
        tiempoMin: (p.tiempoMin === null || p.tiempoMin === undefined) ? '' : p.tiempoMin,
        equipo: p.equipo || ''
      }));
    if (!this.pasosEdit.length) {
      this.pasosEdit = [{ titulo: '', instruccion: '', tiempoMin: '', equipo: '' }];
    }

    this.mostrarModal(`
      <h3 style="margin-bottom:4px;">📖 Preparación</h3>
      <div style="font-weight:700;color:var(--primary-strong);margin-bottom:10px;">${this.escapeHtml(this._nombreProducto(codigo))}</div>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px;">
        Un producto = una receta. El orden de esta lista es el orden en que se
        imprime en la comanda. Los pasos sin instrucción se descartan al guardar.
      </p>
      <div id="pasosLista"></div>
      <div class="actions" style="margin-top:12px;margin-bottom:0;align-items:center;">
        <button class="btn btn-secondary" data-action="paso-agregar" type="button">+ Agregar paso</button>
        <span style="flex:1 1 auto;min-width:8px;"></span>
        <button class="btn btn-success" data-action="paso-guardar" data-codigo="${this.escapeHtml(codigo)}" type="button">💾 Guardar receta</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `, { width: '720px' });
    this.pasosRender();
  },

  /** Lee los inputs del editor hacia `pasosEdit`. Siempre antes de re-dibujar. */
  pasosLeer() {
    const cont = document.getElementById('pasosLista');
    if (!cont || !this.pasosEdit) return;
    cont.querySelectorAll('[data-paso-i]').forEach(inp => {
      const i = Number(inp.dataset.pasoI);
      const f = inp.dataset.pasoF;
      if (this.pasosEdit[i] && f) this.pasosEdit[i][f] = inp.value;
    });
  },

  pasosRender() {
    const cont = document.getElementById('pasosLista');
    if (!cont || !this.pasosEdit) return;
    if (!this.pasosEdit.length) {
      cont.innerHTML = `<p class="empty-state">Sin pasos. Pulse <strong>+ Agregar paso</strong> para empezar.</p>`;
      return;
    }
    cont.innerHTML = this.pasosEdit.map((p, i) => `
      <div class="paso-fila" style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--surface);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <strong style="min-width:62px;color:var(--primary-strong);">Paso ${i + 1}</strong>
          <input data-paso-i="${i}" data-paso-f="titulo" maxlength="120"
                 value="${this.escapeHtml(p.titulo || '')}"
                 placeholder="Título (opcional) — ej. Hornear" style="flex:1;min-width:180px;">
          <button class="btn btn-sm btn-secondary" data-action="paso-subir" data-i="${i}" type="button" title="Subir el paso" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm btn-secondary" data-action="paso-bajar" data-i="${i}" type="button" title="Bajar el paso" ${i === this.pasosEdit.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-danger" data-action="paso-quitar" data-i="${i}" type="button" title="Eliminar el paso">✕</button>
        </div>
        <textarea data-paso-i="${i}" data-paso-f="instruccion" rows="2" maxlength="2000"
                  placeholder="¿Cómo se hace? ej. Partir el pan por la mitad y untar salsa chipotle…"
                  style="width:100%;resize:vertical;">${this.escapeHtml(p.instruccion || '')}</textarea>
        <div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap;align-items:center;">
          <label style="display:flex;align-items:center;gap:5px;font-size:0.85rem;color:var(--text-muted);">
            Tiempo
            <input data-paso-i="${i}" data-paso-f="tiempoMin" type="number" min="0" max="1440" step="0.5"
                   value="${this.escapeHtml(String(p.tiempoMin === '' || p.tiempoMin === null || p.tiempoMin === undefined ? '' : p.tiempoMin))}"
                   placeholder="min" style="width:86px;">
          </label>
          <label style="display:flex;align-items:center;gap:5px;font-size:0.85rem;color:var(--text-muted);">
            Equipo
            <input data-paso-i="${i}" data-paso-f="equipo" maxlength="60"
                   value="${this.escapeHtml(p.equipo || '')}"
                   placeholder="Air Fryer, Horno…" style="width:180px;">
          </label>
        </div>
      </div>`).join('');
  },

  pasosAgregar() {
    this.pasosLeer();
    this.pasosEdit.push({ titulo: '', instruccion: '', tiempoMin: '', equipo: '' });
    this.pasosRender();
    const filas = document.querySelectorAll('#pasosLista .paso-fila');
    const ultima = filas[filas.length - 1];
    if (ultima) ultima.querySelector('textarea')?.focus();
  },

  pasosQuitar(i) {
    this.pasosLeer();
    this.pasosEdit.splice(i, 1);
    this.pasosRender();
  },

  /** Mueve un paso una posición: el orden de la lista ES el orden de la comanda. */
  pasosMover(i, dir) {
    this.pasosLeer();
    const j = i + dir;
    if (j < 0 || j >= this.pasosEdit.length) return;
    const tmp = this.pasosEdit[i];
    this.pasosEdit[i] = this.pasosEdit[j];
    this.pasosEdit[j] = tmp;
    this.pasosRender();
  },

  async pasosGuardar(codigo) {
    this.pasosLeer();
    const pasos = this.pasosEdit
      .map(p => ({
        titulo: (p.titulo || '').trim(),
        instruccion: (p.instruccion || '').trim(),
        tiempoMin: (p.tiempoMin === '' || p.tiempoMin === null || p.tiempoMin === undefined) ? null : Number(p.tiempoMin),
        equipo: (p.equipo || '').trim()
      }))
      .filter(p => p.instruccion !== '');

    if (!pasos.length) {
      this.showMessage('modalMsg', 'Escribe al menos un paso: la instrucción no puede quedar vacía', 'error');
      return;
    }
    const vacios = this.pasosEdit.length - pasos.length;
    if (vacios > 0 &&
        !confirm(`Hay ${vacios} paso${vacios === 1 ? '' : 's'} sin instrucción y se ${vacios === 1 ? 'descartará' : 'descartarán'}. ¿Continuar?`)) {
      return;
    }

    try {
      await apiPut('/receta-pasos/' + encodeURIComponent(codigo), { pasos });
      this.cerrarModal();
      await this.cargarRecetas();
      this.showMessage('recetasMsg', `Receta guardada (${pasos.length} paso${pasos.length === 1 ? '' : 's'})`, 'success');
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  /** Lectura de la receta, tal como la ve cocina. */
  recetaPasosVer(codigo) {
    const lista = (this._pasosAgrupados()[codigo] || []);
    const cuerpo = lista.length
      ? `<ol style="margin:0;padding-left:22px;">${lista.map(p => `
          <li style="margin-bottom:10px;">
            ${p.titulo ? `<strong>${this.escapeHtml(p.titulo)}</strong>` : ''}
            ${(p.tiempoMin || p.equipo)
              ? `<span style="color:var(--text-muted);font-size:0.85rem;">${p.tiempoMin ? ` · ${p.tiempoMin} min` : ''}${p.equipo ? ` · ${this.escapeHtml(p.equipo)}` : ''}</span>`
              : ''}
            <br>${this.escapeHtml(p.instruccion)}
          </li>`).join('')}</ol>`
      : '<p class="empty-state">Este producto no tiene preparación escrita.</p>';

    this.mostrarModal(`
      <h3 style="margin-bottom:4px;">📖 Preparación</h3>
      <div style="font-weight:700;color:var(--primary-strong);margin-bottom:12px;">${this.escapeHtml(this._nombreProducto(codigo))}</div>
      ${cuerpo}
      <div class="actions" style="margin-top:16px;margin-bottom:0;">
        <button class="btn btn-secondary" data-action="paso-editar" data-codigo="${this.escapeHtml(codigo)}" type="button">✏️ Editar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cerrar</button>
      </div>
    `, { width: '640px' });
  },

  async recetaPasosEliminar(codigo) {
    if (!confirm(`¿Eliminar la preparación de "${this._nombreProducto(codigo)}"?`)) return;
    try {
      await apiDelete('/receta-pasos/' + encodeURIComponent(codigo));
      await this.cargarRecetas();
      this.showMessage('recetasMsg', 'Preparación eliminada', 'success');
    } catch (e) {
      this.showMessage('recetasMsg', 'Error: ' + e.message, 'error');
    }
  },

  // ─── Recetas de insumos (v7a) ─────────────────────────────────────────────

  recetaMostrarFormNueva() {
    const prodsOpts = this.recetasProductos.map(p => `<option value="${this.escapeHtml(p.codigo)}">${this.escapeHtml(p.nombre)} (${this.escapeHtml(p.codigo)})</option>`).join('');
    const mpOpts = this.recetasMP.map(m => `<option value="${this.escapeHtml(m.codigo)}">${this.escapeHtml(m.nombre)} (${this.escapeHtml(m.unidad)})</option>`).join('');
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">Nueva receta de insumos</h3>
      <div class="form-group">
        <label>Producto *</label>
        <select id="recetaProducto">${prodsOpts}</select>
      </div>
      <div class="form-group">
        <label>Materia Prima *</label>
        <select id="recetaMP">${mpOpts}</select>
      </div>
      <div class="form-group">
        <label>Cantidad por unidad *</label>
        <input id="recetaCantidad" type="number" min="0.01" step="0.01" placeholder="Ej: 20 (gramos por taza)" autofocus>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <input id="recetaNotas" type="text" placeholder="Instrucciones (opcional)" maxlength="500">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="receta-guardar" type="button">Guardar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
    document.getElementById('recetaCantidad')?.focus();
  },

  async recetaGuardar() {
    const codigoProducto = document.getElementById('recetaProducto')?.value;
    const codigoMateriaPrima = document.getElementById('recetaMP')?.value;
    const cantidad = parseFloat(document.getElementById('recetaCantidad')?.value);
    const notas = document.getElementById('recetaNotas')?.value?.trim() || null;
    if (!codigoProducto || !codigoMateriaPrima || !cantidad || cantidad <= 0) {
      this.showMessage('modalMsg', 'Producto, materia prima y cantidad son requeridos', 'error');
      return;
    }
    try {
      await apiPost('/recetas', { codigoProducto, codigoMateriaPrima, cantidad, notas });
      this.cerrarModal();
      this.cargarRecetas();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  recetaMostrarFormEditar(id, cantidad, notas) {
    this.mostrarModal(`
      <h3 style="margin-bottom:15px;">Editar receta de insumos</h3>
      <div class="form-group">
        <label>Cantidad por unidad *</label>
        <input id="recetaEditCantidad" type="number" min="0.01" step="0.01" value="${cantidad}" autofocus>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <input id="recetaEditNotas" type="text" value="${this.escapeHtml(notas || '')}" maxlength="500">
      </div>
      <div class="actions">
        <button class="btn btn-success" data-action="receta-actualizar" data-id="${id}" type="button">Actualizar</button>
        <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
      </div>
    `);
    document.getElementById('recetaEditCantidad')?.focus();
  },

  async recetaActualizar(id) {
    const cantidad = parseFloat(document.getElementById('recetaEditCantidad')?.value);
    const notas = document.getElementById('recetaEditNotas')?.value?.trim() || null;
    if (!cantidad || cantidad <= 0) {
      this.showMessage('modalMsg', 'Ingrese una cantidad válida', 'error');
      return;
    }
    try {
      await apiPut(`/recetas/${id}`, { cantidad, notas });
      this.cerrarModal();
      this.cargarRecetas();
    } catch (e) {
      this.showMessage('modalMsg', 'Error: ' + e.message, 'error');
    }
  },

  async recetaEliminar(id) {
    if (!confirm('¿Eliminar este insumo de la receta?')) return;
    try {
      await apiDelete(`/recetas/${id}`);
      this.cargarRecetas();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }
});

if (typeof AppEventRouter !== 'undefined') {
  AppEventRouter.registerMany({
    // Recetas de insumos (v7a)
    'receta-nueva': () => App.recetaMostrarFormNueva(),
    'receta-guardar': () => App.recetaGuardar(),
    'receta-editar': ({ button }) => App.recetaMostrarFormEditar(button.dataset.id, parseFloat(button.dataset.cantidad), button.dataset.notas),
    'receta-actualizar': ({ button }) => App.recetaActualizar(button.dataset.id),
    'receta-eliminar': ({ button }) => App.recetaEliminar(button.dataset.id),

    // Preparación paso a paso (v10)
    'paso-editar-sel': () => App.recetaPasosEditor(document.getElementById('pasoProductoSel')?.value),
    'paso-ver': ({ button }) => App.recetaPasosVer(button.dataset.codigo),
    'paso-editar': ({ button }) => App.recetaPasosEditor(button.dataset.codigo),
    'paso-borrar': ({ button }) => App.recetaPasosEliminar(button.dataset.codigo),
    'paso-agregar': () => App.pasosAgregar(),
    'paso-quitar': ({ button }) => App.pasosQuitar(Number(button.dataset.i)),
    'paso-subir': ({ button }) => App.pasosMover(Number(button.dataset.i), -1),
    'paso-bajar': ({ button }) => App.pasosMover(Number(button.dataset.i), 1),
    'paso-guardar': ({ button }) => App.pasosGuardar(button.dataset.codigo)
  });
}
