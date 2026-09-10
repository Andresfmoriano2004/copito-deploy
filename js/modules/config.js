// Copito POS — Configuración, colaboradores, auditoría y limpieza.
// Fase 1: split mecánico de js/app.js, sin cambios de lógica.
// Se carga DESPUÉS de js/app.js y extiende la fachada global App.
Object.assign(App, {

  // ================== CONFIGURACIÓN ==================
  cargarConfiguracion() {
    const container = document.querySelector('#configuracion .content-body');
    if (!container) return;
    const esAdmin = this.state.user?.rol === 'admin';
    Promise.all([obtenerGrupos(), obtenerUnidades(), esAdmin ? obtenerUsuarios().catch(() => []) : Promise.resolve([])]).then(([grupos, unidades, usuarios]) => {
      container.innerHTML = `
        <div class="card"><div class="card-header">Herramientas de Administración</div><div class="card-body">
          <div class="actions">
            <button class="btn btn-primary" data-action="show-add-grupo" type="button">+ Nuevo Grupo</button>
            <button class="btn btn-primary" data-action="show-add-unidad" type="button">+ Nueva Unidad</button>
          </div>
        </div></div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${grupos.length}</div><div class="stat-label">Grupos</div></div>
          <div class="stat-card"><div class="stat-value">${unidades.length}</div><div class="stat-label">Unidades</div></div>
          ${esAdmin ? `<div class="stat-card"><div class="stat-value">${usuarios.length}</div><div class="stat-label">Colaboradores</div></div>` : ''}
        </div>
        <div class="card"><div class="card-header">📂 Grupos</div><div class="card-body">
          <div id="gruposList">${grupos.map(g => `<span class="chip">${this.escapeHtml(g)} <span data-action="eliminar-grupo" data-nombre="${this.escapeHtml(g)}" style="cursor:pointer;margin-left:5px;">&times;</span></span>`).join(' ')}</div>
        </div></div>
        <div class="card"><div class="card-header">📏 Unidades</div><div class="card-body">
          <div id="unidadesList">${unidades.map(u => `<span class="chip">${this.escapeHtml(u)} <span data-action="eliminar-unidad" data-nombre="${this.escapeHtml(u)}" style="cursor:pointer;margin-left:5px;">&times;</span></span>`).join(' ')}</div>
        </div></div>
        ${esAdmin ? `
        <div class="card"><div class="card-header">👥 Colaboradores (códigos MES/CAJ/ADM)</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group"><label for="newUserUsername">Usuario</label><input id="newUserUsername" type="text" placeholder="mesero1" autocomplete="off"></div>
            <div class="form-group"><label for="newUserNombre">Nombre</label><input id="newUserNombre" type="text" placeholder="Nombre completo"></div>
            <div class="form-group"><label for="newUserPass">Contraseña (mín. 6)</label><input id="newUserPass" type="password" placeholder="••••••" autocomplete="new-password"></div>
            <div class="form-group"><label for="newUserRol">Rol</label><select id="newUserRol"><option value="vendedor">Vendedor</option><option value="admin">Admin</option></select></div>
            <div class="form-group"><label for="newUserCodigo">Código (ej. MES-001)</label><input id="newUserCodigo" type="text" placeholder="MES-001" autocomplete="off"></div>
          </div>
          <div class="actions"><button class="btn btn-success" data-action="crear-colaborador" type="button">➕ Crear colaborador</button></div>
          <div class="table-container"><table><thead><tr><th>Código</th><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>${usuarios.map(u => `<tr>
              <td><strong>${this.escapeHtml(u.codigo_referencia || '—')}</strong></td>
              <td>${this.escapeHtml(u.username)}</td><td>${this.escapeHtml(u.nombre)}</td><td>${this.escapeHtml(u.rol)}</td>
              <td>${u.activo ? '<span class="text-success">✔ Activo</span>' : '<span class="text-danger">✖ Inactivo</span>'}</td>
              <td>${u.activo ? `<button class="btn-icon" data-action="desactivar-usuario" data-userid="${u.id}" title="Desactivar">🚫</button>` : `<button class="btn-icon" data-action="reactivar-usuario" data-userid="${u.id}" title="Reactivar">♻️</button>`}</td>
            </tr>`).join('')}</tbody></table></div>
        </div></div>` : ''}
        <div class="card"><div class="card-header">🔍 Auditoría ${esAdmin ? '(todas las operaciones)' : '(mis operaciones)'}</div><div class="card-body">
          <div class="form-grid">
            <div class="form-group"><label for="auditPedido">Pedido</label><input id="auditPedido" type="text" placeholder="PED-..."></div>
            <div class="form-group"><label for="auditOp">Operación</label><select id="auditOp"><option value="">Todas</option><option>CREAR_PEDIDO</option><option>AGREGAR_PRODUCTO_PEDIDO</option><option>MODIFICAR_PRODUCTO_PEDIDO</option><option>MODIFICAR_PEDIDO</option><option>ELIMINAR_PRODUCTO_PEDIDO</option><option>CANCELAR_PEDIDO</option><option>REGISTRAR_PAGO</option><option>ABONO_PEDIDO</option><option>REGISTRAR_PAGO_ITEM</option><option>REGISTRAR_PAGO_ITEMS</option><option>ABRIR_CAJA</option><option>CERRAR_CAJA</option><option>MOVIMIENTO_CAJA</option><option>CREAR_USUARIO</option><option>MODIFICAR_USUARIO</option><option>DESACTIVAR_USUARIO</option></select></div>
          </div>
          <div class="actions"><button class="btn btn-primary" data-action="filtrar-auditoria" type="button">🔍 Consultar</button></div>
          <div class="table-container"><div id="auditoriaTable" aria-live="polite"><div style="color:var(--text-muted);">Pulse Consultar para ver quién hizo cada operación.</div></div></div>
        </div></div>
        ${esAdmin ? `
        <div class="card danger-zone"><div class="card-header">🗑️ Limpieza de registros</div><div class="card-body">
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:12px;">Elimine datos operativos por módulo. <strong>Nunca se tocan:</strong> usuarios, productos, grupos, unidades ni mesas.</p>
          <div id="limpiezaConteo" style="margin-bottom:12px;color:var(--text-muted);font-size:0.85rem;">Cargando conteo...</div>
          <div class="actions"><button class="btn btn-danger" data-action="abrir-limpieza" type="button">🗑️ Limpiar registros...</button></div>
        </div></div>` : ''}
        <div id="configMsg" aria-live="polite"></div>`;
      if (esAdmin) {
        obtenerConteoRegistros().then(data => {
          const el = document.getElementById('limpiezaConteo');
          if (!el) return;
          const nombres = { pedidos: 'Pedidos', movimientos: 'Movimientos', caja: 'Caja', auditoria: 'Auditoría' };
          const c = data.conteo || {};
          el.innerHTML = 'Registros actuales: ' + Object.keys(nombres).map(k =>
            `<span class="chip">${nombres[k]}: <strong>${c[k] ?? 0}</strong></span>`).join(' ') +
            '<br><span style="font-size:0.8rem;">🔒 Protegidos: usuarios, productos, grupos, unidades, mesas.</span>';
        }).catch(() => {
          const el = document.getElementById('limpiezaConteo');
          if (el) el.innerHTML = '';
        });
      }
    }).catch(err => { this.showMessage(container, 'Error: ' + err.message, 'error'); });
  },


  crearColaborador() {
    const username = document.getElementById('newUserUsername')?.value?.trim();
    const nombre = document.getElementById('newUserNombre')?.value?.trim();
    const password = document.getElementById('newUserPass')?.value || '';
    const rol = document.getElementById('newUserRol')?.value || 'vendedor';
    const codigoReferencia = document.getElementById('newUserCodigo')?.value?.trim().toUpperCase();
    if (!username || !nombre || !password) return this.showMessage('configMsg', 'Usuario, nombre y contraseña requeridos', 'error');
    crearUsuario({ username, nombre, password, rol, codigoReferencia })
      .then(() => { this.showMessage('configMsg', `Colaborador ${username} creado`, 'success'); this.cargarConfiguracion(); })
      .catch(err => this.showMessage('configMsg', 'Error: ' + err.message, 'error'));
  },


  desactivarUsuario(userid) {
    if (!confirm('¿Desactivar este colaborador?')) return;
    eliminarUsuario(userid)
      .then(() => { this.showMessage('configMsg', 'Colaborador desactivado', 'success'); this.cargarConfiguracion(); })
      .catch(err => this.showMessage('configMsg', 'Error: ' + err.message, 'error'));
  },


  reactivarUsuario(userid) {
    if (!confirm('¿Reactivar este colaborador? Volverá a poder ingresar.')) return;
    actualizarUsuario(userid, { activo: true })
      .then(() => { this.showMessage('configMsg', 'Colaborador reactivado ✔', 'success'); this.cargarConfiguracion(); })
      .catch(err => this.showMessage('configMsg', 'Error: ' + err.message, 'error'));
  },


  filtrarAuditoria() {
    const filtros = {};
    const ped = document.getElementById('auditPedido')?.value?.trim();
    const op = document.getElementById('auditOp')?.value;
    if (ped) filtros.pedido_id = ped;
    if (op) filtros.operacion = op;
    filtros.limit = 100;
    obtenerAuditoria(filtros).then(rows => {
      const el = document.getElementById('auditoriaTable');
      if (!el) return;
      if (!rows.length) { el.innerHTML = '<div class="message info">Sin resultados</div>'; return; }
      el.innerHTML = `<table class="tabla-responsive"><thead><tr><th>Fecha</th><th>Hora</th><th>Colaborador</th><th>Código</th><th>Operación</th><th>Pedido/Mesa</th></tr></thead><tbody>${rows.map(r => `<tr>
        <td data-label="Fecha">${r.fechaCorta || this.fmtFecha(r.fecha)}</td>
        <td data-label="Hora">${r.hora || this.fmtHora(r.fecha)}</td>
        <td data-label="Colaborador">${this.escapeHtml(r.usuario || ('#' + r.usuarioId))}</td>
        <td data-label="Código"><strong>${this.escapeHtml(r.codigoReferencia || '—')}</strong></td><td data-label="Operación">${this.escapeHtml(r.operacion)}</td>
        <td data-label="Pedido/Mesa">${this.escapeHtml([r.pedidoId, r.mesa].filter(Boolean).join(' · ') || '—')}</td>
      </tr>`).join('')}</tbody></table>`;
    }).catch(err => this.showMessage('configMsg', 'Error: ' + err.message, 'error'));
  },


  mostrarFormCrearGrupo() {
    this.mostrarModalPrompt({
      titulo: 'Nuevo Grupo',
      placeholder: 'Nombre del grupo',
      onConfirm: (nombre) => {
        crearGrupo(nombre)
          .then(res => { this.cerrarModal(); this.showMessage('configMsg', res.mensaje, 'success'); this.cargarConfiguracion(); })
          .catch(err => { this.showMessage('configMsg', 'Error: ' + err.message, 'error'); });
      }
    });
  },


  mostrarFormCrearUnidad() {
    this.mostrarModalPrompt({
      titulo: 'Nueva Unidad',
      placeholder: 'Nombre de la unidad',
      onConfirm: (nombre) => {
        crearUnidad(nombre)
          .then(res => { this.cerrarModal(); this.showMessage('configMsg', res.mensaje, 'success'); this.cargarConfiguracion(); })
          .catch(err => { this.showMessage('configMsg', 'Error: ' + err.message, 'error'); });
      }
    });
  },


  eliminarGrupo(nombre) {
    if (!confirm(`¿Eliminar grupo "${nombre}"?`)) return;
    eliminarGrupo(nombre)
      .then(() => { this.showMessage('configMsg', 'Grupo eliminado', 'success'); this.cargarConfiguracion(); })
      .catch(err => { this.showMessage('configMsg', 'Error: ' + err.message, 'error'); });
  },


  eliminarUnidad(nombre) {
    if (!confirm(`¿Eliminar unidad "${nombre}"?`)) return;
    eliminarUnidad(nombre)
      .then(() => { this.showMessage('configMsg', 'Unidad eliminada', 'success'); this.cargarConfiguracion(); })
      .catch(err => { this.showMessage('configMsg', 'Error: ' + err.message, 'error'); });
  },


  clearAllRecords() {
    this.abrirLimpieza();
  },


  // ─── Limpieza SELECTIVA de registros (admin, doble confirmación) ──────
  abrirLimpieza() {
    obtenerConteoRegistros().then(data => {
      this.cerrarModal();
      const c = data.conteo || {};
      const opciones = [
        { id: 'pedidos', label: 'Pedidos (pedidos, detalle y pagos)', n: c.pedidos ?? 0 },
        { id: 'movimientos', label: 'Movimientos de inventario', n: c.movimientos ?? 0 },
        { id: 'caja', label: 'Registros de caja (aperturas, cierres y movimientos)', n: c.caja ?? 0 },
        { id: 'auditoria', label: 'Historial de auditoría', n: c.auditoria ?? 0 }
      ];
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;font-family:var(--font);';
      modal.innerHTML = `<div style="background:white;border-radius:12px;padding:30px;max-width:480px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
        <h3 style="color:var(--danger);margin-bottom:10px;">⚠️ Limpiar registros</h3>
        <p style="font-size:0.9rem;margin-bottom:6px;">Esta acción <strong>eliminará los registros seleccionados y no podrá deshacerse</strong>.</p>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:15px;">🔒 Se conservan siempre: usuarios, productos, grupos, unidades y mesas.</p>
        ${opciones.map(o => `<label class="limpieza-opt"><input type="checkbox" class="limpieza-check" value="${o.id}"> <span>${o.label}</span> <strong>(${(o.n ?? 0)} registros)</strong></label>`).join('')}
        <div class="form-group" style="margin-top:15px;"><label for="limpiezaConfirm">Paso 2: escriba <strong>ELIMINAR</strong> para confirmar</label>
        <input id="limpiezaConfirm" type="text" placeholder="ELIMINAR" autocomplete="off" style="width:100%;"></div>
        <div id="limpiezaMsg" aria-live="polite"></div>
        <div class="actions" style="margin-bottom:0;">
          <button class="btn btn-danger" data-action="ejecutar-limpieza" type="button">Eliminar registros</button>
          <button class="btn btn-secondary" data-action="cerrar-modal" type="button">Cancelar</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }).catch(err => this.showMessage('configMsg', 'Error: ' + err.message, 'error'));
  },


  ejecutarLimpieza() {
    const seleccionados = Array.from(document.querySelectorAll('.limpieza-check:checked')).map(c => c.value);
    const confirmacion = document.getElementById('limpiezaConfirm')?.value?.trim() || '';
    const msgEl = document.getElementById('limpiezaMsg');
    const msg = (t, type) => { if (msgEl) msgEl.innerHTML = `<div class="message ${type}">${t}</div>`; };
    if (!seleccionados.length) { msg('Seleccione al menos un tipo de registro.', 'error'); return; }
    if (confirmacion.toUpperCase() !== 'ELIMINAR') { msg('Debe escribir ELIMINAR para confirmar.', 'error'); return; }
    if (!confirm(`¿Está seguro de que desea continuar?\n\nSe eliminarán: ${seleccionados.join(', ')}.\nEsta acción no se puede deshacer.`)) return;
    limpiarRegistros(seleccionados, confirmacion)
      .then(res => {
        this.cerrarModal();
        const det = res.eliminados ? Object.entries(res.eliminados).map(([t, n]) => `${t}: ${n}`).join(' · ') : '';
        this.showMessage('configMsg', `${res.mensaje}${det ? ' (' + det + ')' : ''}`, 'success');
        this.cargarConfiguracion();
      })
      .catch(err => msg('Error: ' + err.message, 'error'));
  }
});
