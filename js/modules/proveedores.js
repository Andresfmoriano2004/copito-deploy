// Copito POS — Catálogo de proveedores.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== PROVEEDORES ==================
  cargarProveedores() {
    const container = document.querySelector('#proveedores .content-body');
    if (!container) return;
    obtenerProveedores(true).then(rows => {
      container.innerHTML = `
        <div class="card"><div class="card-header">➕ Nuevo Proveedor</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group"><label for="provNombre">Nombre *</label><input id="provNombre" type="text" placeholder="Distribuidora..." autocomplete="off"></div>
            <div class="form-group"><label for="provContacto">Contacto</label><input id="provContacto" type="text" placeholder="Persona contacto" autocomplete="off"></div>
            <div class="form-group"><label for="provTelefono">Teléfono</label><input id="provTelefono" type="tel" placeholder="300..." autocomplete="off"></div>
            <div class="form-group"><label for="provTelefono2">Teléfono 2 (opcional)</label><input id="provTelefono2" type="tel" placeholder="Otro teléfono" autocomplete="off"></div>
            <div class="form-group"><label for="provEmail">Email</label><input id="provEmail" type="email" placeholder="correo@..." autocomplete="off"></div>
            <div class="form-group"><label for="provNit">NIT</label><input id="provNit" type="text" placeholder="NIT" autocomplete="off"></div>
            <div class="form-group"><label for="provDireccion">Dirección</label><input id="provDireccion" type="text" placeholder="Dirección" autocomplete="off"></div>
            <div class="form-group"><label for="provDireccion2">Dirección 2 (opcional)</label><input id="provDireccion2" type="text" placeholder="Otra sede / bodega" autocomplete="off"></div>
            <div class="form-group"><label for="provComentarios">Comentarios</label><textarea id="provComentarios" rows="2" placeholder="Notas, condiciones, horarios..."></textarea></div>
          </div>
          <div class="actions"><button class="btn btn-success" data-action="crear-proveedor" type="button">➕ Crear proveedor</button></div>
          <div id="provMsg" aria-live="polite"></div>
        </div></div>
        <div class="card"><div class="card-header">📞 Proveedores (${rows.length})</div><div class="card-body">
          <div class="table-container"><table class="tabla-responsive"><thead><tr><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>NIT</th><th>Comentarios</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>${rows.map(p => `<tr>
            <td data-label="Nombre"><strong>${this.escapeHtml(p.nombre)}</strong>${p.direccion ? `<br><small style="color:var(--text-muted);">📍 ${this.escapeHtml(p.direccion)}</small>` : ''}${p.direccion2 ? `<br><small style="color:var(--text-muted);">📍 ${this.escapeHtml(p.direccion2)}</small>` : ''}</td>
            <td data-label="Contacto">${this.escapeHtml(p.contacto || '—')}</td>
            <td data-label="Teléfono">${this.escapeHtml(p.telefono || '—')}${p.telefono2 ? `<br><small style="color:var(--text-muted);">${this.escapeHtml(p.telefono2)}</small>` : ''}</td>
            <td data-label="Email">${this.escapeHtml(p.email || '—')}</td>
            <td data-label="NIT">${this.escapeHtml(p.nit || '—')}</td>
            <td data-label="Comentarios" style="max-width:220px;">${this.escapeHtml(p.comentarios || '—')}</td>
            <td data-label="Estado">${p.activo ? '<span class="text-success">✔ Activo</span>' : '<span class="text-danger">✖ Inactivo</span>'}</td>
            <td data-label="Acción"><button class="btn-icon" data-action="editar-proveedor" data-id="${p.id}" title="Editar">✏️</button> ${p.activo ? `<button class="btn-icon" data-action="eliminar-proveedor" data-id="${p.id}" title="Desactivar">🚫</button>` : `<button class="btn-icon" data-action="reactivar-proveedor" data-id="${p.id}" title="Reactivar">♻️</button>`}</td>
          </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Sin proveedores registrados</td></tr>'}</tbody></table></div>
        </div></div>`;
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },


  crearProveedor() {
    const data = {
      nombre: document.getElementById('provNombre')?.value?.trim() || '',
      contacto: document.getElementById('provContacto')?.value?.trim() || '',
      telefono: document.getElementById('provTelefono')?.value?.trim() || '',
      telefono2: document.getElementById('provTelefono2')?.value?.trim() || '',
      email: document.getElementById('provEmail')?.value?.trim() || '',
      nit: document.getElementById('provNit')?.value?.trim() || '',
      direccion: document.getElementById('provDireccion')?.value?.trim() || '',
      direccion2: document.getElementById('provDireccion2')?.value?.trim() || '',
      comentarios: document.getElementById('provComentarios')?.value?.trim() || ''
    };
    if (!data.nombre) return this.showMessage('provMsg', 'Nombre requerido', 'error');
    crearProveedor(data)
      .then(() => { this.showMessage('provMsg', `Proveedor ${data.nombre} creado`, 'success'); this.cargarProveedores(); })
      .catch(err => this.showMessage('provMsg', 'Error: ' + err.message, 'error'));
  },


  eliminarProveedor(id) {
    if (!confirm('¿Desactivar este proveedor?')) return;
    eliminarProveedor(id)
      .then(() => { this.showMessage('provMsg', 'Proveedor desactivado', 'success'); this.cargarProveedores(); })
      .catch(err => this.showMessage('provMsg', 'Error: ' + err.message, 'error'));
  },


  reactivarProveedor(id) {
    if (!confirm('¿Reactivar este proveedor?')) return;
    actualizarProveedor(id, { activo: true })
      .then(() => { this.showMessage('provMsg', 'Proveedor reactivado ✔', 'success'); this.cargarProveedores(); })
      .catch(err => this.showMessage('provMsg', 'Error: ' + err.message, 'error'));
  },


  editarProveedor(id) {
    obtenerProveedores(true).then(rows => {
      const p = rows.find(x => String(x.id) === String(id));
      if (!p) return this.showMessage('provMsg', 'Proveedor no encontrado', 'error');
      this.cerrarModal();
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:550px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow-y:auto;">
        <h3 style="color:var(--primary);margin-bottom:20px;">✏️ Editar Proveedor</h3>
        <div class="form-grid">
          <div class="form-group"><label>Nombre *</label><input id="editProvNombre" type="text" value="${this.escapeHtml(p.nombre)}"></div>
          <div class="form-group"><label>Contacto</label><input id="editProvContacto" type="text" value="${this.escapeHtml(p.contacto || '')}"></div>
          <div class="form-group"><label>Teléfono</label><input id="editProvTelefono" type="tel" value="${this.escapeHtml(p.telefono || '')}"></div>
          <div class="form-group"><label>Teléfono 2 (opcional)</label><input id="editProvTelefono2" type="tel" value="${this.escapeHtml(p.telefono2 || '')}"></div>
          <div class="form-group"><label>Email</label><input id="editProvEmail" type="email" value="${this.escapeHtml(p.email || '')}" placeholder="Agregar cuando lo tenga"></div>
          <div class="form-group"><label>NIT</label><input id="editProvNit" type="text" value="${this.escapeHtml(p.nit || '')}" placeholder="Agregar cuando lo tenga"></div>
          <div class="form-group"><label>Dirección</label><input id="editProvDireccion" type="text" value="${this.escapeHtml(p.direccion || '')}"></div>
          <div class="form-group"><label>Dirección 2 (opcional)</label><input id="editProvDireccion2" type="text" value="${this.escapeHtml(p.direccion2 || '')}"></div>
          <div class="form-group"><label>Comentarios</label><textarea id="editProvComentarios" rows="2">${this.escapeHtml(p.comentarios || '')}</textarea></div>
        </div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-success" data-action="guardar-edicion-proveedor" data-id="${p.id}" type="button">Guardar</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }).catch(err => this.showMessage('provMsg', 'Error: ' + err.message, 'error'));
  },


  guardarEdicionProveedor(id) {
    const data = {
      nombre: document.getElementById('editProvNombre')?.value?.trim() || '',
      contacto: document.getElementById('editProvContacto')?.value?.trim() || '',
      telefono: document.getElementById('editProvTelefono')?.value?.trim() || '',
      telefono2: document.getElementById('editProvTelefono2')?.value?.trim() || '',
      email: document.getElementById('editProvEmail')?.value?.trim() || '',
      nit: document.getElementById('editProvNit')?.value?.trim() || '',
      direccion: document.getElementById('editProvDireccion')?.value?.trim() || '',
      direccion2: document.getElementById('editProvDireccion2')?.value?.trim() || '',
      comentarios: document.getElementById('editProvComentarios')?.value?.trim() || ''
    };
    if (!data.nombre) return alert('Nombre requerido');
    actualizarProveedor(id, data)
      .then(() => { this.cerrarModal(); this.cargarProveedores(); })
      .catch(err => alert('Error: ' + err.message));
  }
});
