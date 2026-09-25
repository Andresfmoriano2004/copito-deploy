const App = {
  state: {
    currentTab: 'dashboard',
    stockData: null,
    searchTimeout: null,
    isMobile: window.innerWidth <= 768,
    currentPedidoId: null,
    pedidosActivos: [],
    productosConPrecio: [],
    cerrandoPedido: false,
    mesaMode: 'activas',
    cuentas: ['A', 'B'],
    currentCuentaSeleccionada: null,
    currentCuentasPedido: [],
    user: null
  },

  TABS: ['dashboard', 'productos', 'movimientos', 'proveedores', 'inventario', 'reportes', 'materia-prima', 'recetas', 'angie', 'buscar', 'mesas', 'caja', 'configuracion'],

  TAB_TITLES: {
    dashboard: 'Dashboard',
    productos: 'Productos',
    movimientos: 'Movimientos',
    proveedores: 'Proveedores',
    inventario: 'Inventario',
    reportes: 'Reportes',
    'materia-prima': 'Materia Prima',
    recetas: 'Recetas',
    angie: 'Gasto Personal',
    buscar: 'Buscar',
    mesas: 'Mesas / Pedidos',
    caja: 'Caja',
    configuracion: 'Configuración'
  },

  TAB_FUNCTIONS: {
    dashboard: 'cargarDashboard',
    productos: 'cargarProductos',
    movimientos: 'cargarMovimientos',
    proveedores: 'cargarProveedores',
    inventario: 'cargarInventario',
    reportes: 'cargarReportes',
    'materia-prima': 'cargarMateriaPrima',
    recetas: 'cargarRecetas',
    angie: 'cargarAngie',
    buscar: 'cargarBuscar',
    mesas: 'cargarVistaMesas',
    caja: 'cargarCaja',
    configuracion: 'cargarConfiguracion'
  },

  METODOS_PAGO: [
    { id: 'Efectivo', label: 'Efectivo', icon: '💵', tipo: 'FISICO' },
    { id: 'Transferencia', label: 'Transferencia bancaria', icon: '🏦', tipo: 'BANCARIO' }
  ],

  icon(name, className = '') {
    const icons = {
      dashboard: '<svg viewBox="0 0 24 24"><path d="M4 18V9M10 18V5M16 18v-8M22 18V3"/><path d="M2 18h20"/></svg>',
      package: '<svg viewBox="0 0 24 24"><path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z"/><path d="M3 7.5V16.5L12 21l9-4.5V7.5"/><path d="M12 12V21"/></svg>',
      report: '<svg viewBox="0 0 24 24"><path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/><path d="M3 19h18"/></svg>',
      inventory: '<svg viewBox="0 0 24 24"><path d="M4 8 12 3l8 5-8 5-8-5Z"/><path d="M4 8v8l8 5 8-5V8"/><path d="M12 13v8"/></svg>',
      cash: '<svg viewBox="0 0 24 24"><path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M8 12h8"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="5.5"/><path d="M16 16l5 5"/></svg>',
      settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.97l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1.08 1.64V21a2 2 0 0 1-4 0v-.08A1.8 1.8 0 0 0 8.84 19.4a1.8 1.8 0 0 0-1.97.36l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2.88a2 2 0 0 1 0-4h.08A1.8 1.8 0 0 0 4.6 8.84a1.8 1.8 0 0 0-.36-1.97l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.8 1.8 0 0 0 8.84 4.6a1.8 1.8 0 0 0 1.08-1.64V2.88a2 2 0 0 1 4 0v.08A1.8 1.8 0 0 0 15.16 4.6a1.8 1.8 0 0 0 1.97-.36l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.8 1.8 0 0 0 19.4 8.84a1.8 1.8 0 0 0 1.64 1.08h.08a2 2 0 0 1 0 4h-.08A1.8 1.8 0 0 0 19.4 15Z"/></svg>',
      exit: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
      ring: '<svg viewBox="0 0 24 24"><path d="M12 3v5"/><path d="M12 16v5"/><path d="M3 12h5"/><path d="M16 12h5"/><circle cx="12" cy="12" r="4"/></svg>',
      info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 2"/></svg>',
      alert: '<svg viewBox="0 0 24 24"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>',
      plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
      edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
      trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
      eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
      table: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v16M16 4v16"/></svg>',
      cup: '<svg viewBox="0 0 24 24"><path d="M5 9h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z"/><path d="M17 9h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/><path d="M7 3v3M12 3v3M17 3v3"/></svg>'
    };
    const svg = icons[name] || icons.info;
    return `<span class="app-icon ${className}" aria-hidden="true">${svg}</span>`;
  },

  LUGARES: [
    { id: 'Barra 1', tipo: 'barra', label: 'Barra 1', icon: '🥃' },
    { id: 'Barra 2', tipo: 'barra', label: 'Barra 2', icon: '🥃' },
    { id: 'Barra 3', tipo: 'barra', label: 'Barra 3', icon: '🥃' },
    { id: 'Sofá', tipo: 'sofa', label: 'Sofá', icon: '🛋️' },
    { id: 'Mesa 1', tipo: 'mesa', label: 'Mesa 1', icon: '🍽️' },
    { id: 'Mesa 2', tipo: 'mesa', label: 'Mesa 2', icon: '🍽️' },
    { id: 'Mesa 3', tipo: 'mesa', label: 'Mesa 3', icon: '🍽️' }
  ],

  CURRENCY: { symbol: '$', code: 'COP', label: 'Pesos Colombianos' },
    TZ: 'America/Bogota',


  showTab(tab) {
    this.state.currentTab = tab;
    try { localStorage.setItem('copito_tab', tab); } catch(e) {}
    this.TABS.forEach(t => {
      const section = document.getElementById(t);
      if (section) section.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.sidebar nav button, .nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
    });
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = this.TAB_TITLES[tab] || tab;

    const fn = this.TAB_FUNCTIONS[tab];
    if (fn && this[fn]) this[fn]();

    if (this.state.isMobile) this.closeSidebar();
  },


  closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  },


  openSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('visible');
  },


  // ================== EVENT DELEGATION ==================
  handleClick(e) {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    // Fallback: si PosController no se cargó (red móvil inestable),
    // enrutar acciones POS a los métodos legacy de App en vez de ignorarlas.
    if (typeof PosController === 'undefined' && (action.indexOf('pos-') === 0 || action === 'volver-mesas')) {
      this._handlePosFallback(action, actionBtn);
      return;
    }
    const actions = {
      'save-product': () => this.guardarProducto(),
      'save-movement': () => this.guardarMovimiento(),
      'filtro-mov-tipo': () => this.filtrarMovTipo(actionBtn.dataset.tipo || ''),
      'update-product': () => this.actualizarProductoDesdeModal(),
      'refresh-dashboard': () => this.cargarDashboard(),
      'refresh-inventario': () => this.cargarInventario(),
      'refresh-reportes': () => this.cargarReportes(),
      'view-product': () => this.verDetalleProducto(actionBtn.dataset.codigo),
      'edit-product': () => this.mostrarFormProducto(actionBtn.dataset.codigo),
      'delete-product': () => this.eliminarProducto(actionBtn.dataset.codigo, actionBtn.dataset.nombre),
      'nuevo-pedido': () => this.mostrarFormNuevoPedido(actionBtn.dataset.lugar),
      'configurar-mesa': () => this.configurarMesa(actionBtn.dataset.mesaid, actionBtn.dataset.mesanombre),
      'ver-pedido': () => this.verPedido(actionBtn.dataset.pedidoid),
      'cerrar-modal': () => this.cerrarModal(),
      'refresh-mesas': () => this.cargarVistaMesas(),
      'crear-pedido': () => this.crearPedido(),
      'agregar-item': () => this.mostrarPosOrder(this.state.currentPedidoId || Store.get('pedidos.currentId')),
      'seleccionar-producto-menu': () => this.seleccionarProductoMenu(actionBtn.dataset.codigo),
      'guardar-item-menu': () => this.guardarItemMenu(),
      'eliminar-item': () => this.confirmarEliminarItem(actionBtn.dataset.detalleid),
      'editar-producto': () => this.mostrarFormModificarItem(actionBtn.dataset.detalleid),
      'guardar-mod-item': () => this.guardarModItem(actionBtn.dataset.detalleid),
      'cerrar-pedido': () => this.confirmarCerrarPedido(),
      'confirmar-cerrar-pedido': () => this.confirmarCerrarPedidoPago(),
      'cancelar-pedido': () => this.confirmarCancelarPedido(),
      'editar-pedido': () => this.mostrarFormEditarPedido(),
      'guardar-edicion-pedido': () => this.guardarEdicionPedido(),
      // 'volver-mesas' handled by PosController._bindEvents with stopPropagation.
      'cancelar-item-form': () => this.cerrarModal(),
      'descargar-factura': () => this.descargarFactura(actionBtn.dataset.pedidoid || Store.get('pedidos.currentId')),
      'imprimir-ticket': () => this.descargarFactura(actionBtn.dataset.pedidoid || this.state.currentPedidoId || Store.get('pedidos.currentId')),
      'imprimir-comanda': () => {
        const pId = actionBtn.dataset.pedidoid || this.state.currentPedidoId || Store.get('pedidos.currentId');
        if (window.Ticket) Ticket.mostrarModal(pId, { tipo: 'comanda' });
      },
      'ver-historial-pedido': () => {
        const id = actionBtn.dataset.pedidoid;
        obtenerPedido(id).then(p => { if (!p) { this.showMessage('historialPedidosTable', 'Pedido no encontrado', 'error'); return; } this.mostrarDetallePedidoHistorico(p); })
          .catch(err => this.showMessage('historialPedidosTable', 'Error: ' + err.message, 'error'));
      },
      'mesa-mode-activas': () => this.cambiarModoMesa('activas'),
      'mesa-mode-historial': () => this.cambiarModoMesa('historial'),
      'filtrar-historial': () => this.cargarHistorialPedidos(),
      'eliminar-grupo': () => this.eliminarGrupo(actionBtn.dataset.nombre),
      'eliminar-unidad': () => this.eliminarUnidad(actionBtn.dataset.nombre),
      'show-add-grupo': () => this.mostrarFormCrearGrupo(),
      'show-add-unidad': () => this.mostrarFormCrearUnidad(),
      'clear-all-records': () => this.clearAllRecords(),
      'abrir-limpieza': () => this.abrirLimpieza(),
      'ejecutar-limpieza': () => this.ejecutarLimpieza(),
      'crear-colaborador': () => this.crearColaborador(),
      'crear-proveedor': () => this.crearProveedor(),
      'eliminar-proveedor': () => this.eliminarProveedor(actionBtn.dataset.id),
      'reactivar-proveedor': () => this.reactivarProveedor(actionBtn.dataset.id),
      'editar-proveedor': () => this.editarProveedor(actionBtn.dataset.id),
      'guardar-edicion-proveedor': () => this.guardarEdicionProveedor(actionBtn.dataset.id),
      'desactivar-usuario': () => this.desactivarUsuario(actionBtn.dataset.userid),
      'reactivar-usuario': () => this.reactivarUsuario(actionBtn.dataset.userid),
      'filtrar-auditoria': () => this.filtrarAuditoria(),
      'export-excel-auditoria': () => this.exportarExcelAuditoria(),
      // ─── Caja actions — delegated to CajaController ───
      // 'abrir-caja', 'registrar-mov-caja', 'cerrar-caja-modal', 'confirmar-cierre-caja'
      // are handled by CajaController._bindCajaEvents to avoid double-execution.
      // 'propina-general' handled by CajaController._bindCajaEvents.
      // ─── POS actions — delegated to PosController ───
      // 'volver-mesas', 'descargar-factura' handled by PosController._bindEvents.
      'generar-reporte-ventas': () => this.generarReporteVentas(),
      'generar-reporte-semanal': () => this.generarReporteVentasSemanal(),
      'export-excel-movimientos': () => this.exportarExcel('movimientos'),
      'export-excel-ventas': () => this.exportarExcel('ventas'),
      'export-excel-inventario': () => this.exportarExcel('inventario'),
      'pagar-item': () => this.pagarItem(actionBtn.dataset.detalleid),
      'pagar-seleccionados': () => this.pagarSeleccionados(),
      'activar-split': () => this.activarSplit(),
      'asignar-cuenta': () => this.asignarCuenta(actionBtn.dataset.detalleid, actionBtn.dataset.cuenta),
      'cerrar-cuenta': () => this.cerrarCuenta(actionBtn.dataset.cuenta),
      'seleccionar-items-cuenta': () => this.mostrarModalPagarCuenta(actionBtn.dataset.cuenta),
      'cerrar-cuenta-general': () => this.cerrarCuenta(null),
      'abonar-cuenta': () => this.abonarCuentaUI(actionBtn.dataset.cuenta),
      'abonar-general': () => this.abonarCuentaUI(null),
      'agregar-cuenta': () => this.agregarCuenta(),
      'confirmar-modal-prompt': () => {
        const input = document.getElementById('modalPromptInput');
        const nombre = input?.value?.trim();
        if (!nombre) { input?.focus(); input?.select(); return; }
        if (this._confirmarPromptCallback) this._confirmarPromptCallback(nombre);
      },
      'cancelar-modal-prompt': () => this.cerrarModal(),
      'clear-all': () => {
        const input = document.getElementById('productSearch');
        if (input) input.value = '';
        document.querySelectorAll('#productTableBody tr').forEach(row => row.style.display = '');
      },
      'clear-product': () => {
        ['prodCodigo','prodNombre','prodStockMin','prodPrecio','prodCosto','prodStockInicial'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
      },
      'clear-movement': () => {
        ['movCantidad','movNota'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
      },
      // ─── Materia Prima ───
      'mp-nuevo': () => this.mpMostrarFormNuevo(),
      'mp-guardar': () => this.mpGuardar(),
      'mp-editar': () => this.mpMostrarFormEditar(actionBtn.dataset.codigo),
      'mp-actualizar': () => this.mpActualizar(actionBtn.dataset.codigo),
      'mp-movimiento': () => this.mpMostrarMovimiento(actionBtn.dataset.codigo, actionBtn.dataset.tipo),
      'mp-guardar-mov': () => this.mpGuardarMovimiento(actionBtn.dataset.codigo, actionBtn.dataset.tipo),
      'mp-historial': () => this.mpMostrarHistorial(actionBtn.dataset.codigo),
      'mp-eliminar': () => this.mpEliminar(actionBtn.dataset.codigo, actionBtn.dataset.nombre),
      // ─── Recetas ───
      'receta-nueva': () => this.recetaMostrarFormNueva(),
      'receta-guardar': () => this.recetaGuardar(),
      'receta-editar': () => this.recetaMostrarFormEditar(actionBtn.dataset.id, parseFloat(actionBtn.dataset.cantidad), actionBtn.dataset.notas),
      'receta-actualizar': () => this.recetaActualizar(actionBtn.dataset.id),
      'receta-eliminar': () => this.recetaEliminar(actionBtn.dataset.id),
      // ─── Angie ───
      'angie-registrar': () => this.angieRegistrar(),
      'angie-eliminar': () => this.angieEliminar(actionBtn.dataset.id),
      // ─── POS Split-Screen (handled by PosController._bindEvents) ───
      // pos-add, pos-qty, pos-cat, pos-cobrar, pos-comanda, pos-cancelar,
      // pos-split, pos-split-assign, pos-cobrar-cuenta, pos-volver-detalle,
      // pos-toggle-pagos, pos-cancelar-pedido, pos-editar-pedido
      // are all delegated to PosController to avoid double-execution.
    };
    if (actions[action]) actions[action]();
  },

  // Solo se usa cuando PosController no se cargó. Delega a App._pos*
  // (que a su vez usan el legacy de pos_order.js como respaldo).
  async _handlePosFallback(action, btn) {
    try {
      switch (action) {
        case 'pos-add': return this._posAdd(btn.dataset.codigo);
        case 'pos-qty': return this._posQty(btn.dataset.codigo, btn.dataset.d);
        case 'pos-cat': return this._posSetCat(btn.dataset.cat);
        case 'pos-cobrar': return this._posCobrar();
        case 'pos-cobrar-cuenta': return this._posCobrarCuenta(btn.dataset.cuenta);
        case 'pos-cancelar': return this._posCancelar();
        case 'pos-split': return this._posSplit();
        case 'pos-split-exit':
        case 'pos-split-cancel': return this._posSplitCancel();
        case 'pos-split-assign': return this._posSplitAssign(parseInt(btn.dataset.idx), btn.dataset.cuenta);
        case 'pos-comanda': return this._posComanda();
        case 'pos-cancelar-pedido': return this._posCancelarPedido();
        case 'pos-editar-pedido': return this._posEditarPedido();
        case 'pos-volver-detalle': {
          const pid = this.state.currentPedidoId || (typeof Store !== 'undefined' ? Store.get('pedidos.currentId') : null);
          try { if (typeof this._posSyncCart === 'function') await this._posSyncCart(); } catch (err) {
            if (!confirm('No se pudieron guardar los items (' + err.message + '). ¿Recargar de todas formas?')) return;
          }
          if (pid) return this.verPedido(pid);
          return this.cargarVistaMesas();
        }
        case 'volver-mesas': {
          try { if (typeof this._posSyncCart === 'function') await this._posSyncCart(); } catch (err) {
            if (!confirm('No se pudieron guardar los items (' + err.message + '). ¿Salir de todas formas?')) return;
          }
          return this.cargarVistaMesas();
        }
        case 'pos-toggle-pagos': {
          const list = document.getElementById('posPagosList');
          if (list) list.style.display = list.style.display === 'none' ? 'block' : 'none';
          return;
        }
      }
    } catch (err) {
      this.showMessage('mesaMsg', 'Error: ' + err.message, 'error');
    }
  },


  handleKeydown(e) {
    if (e.key === 'Escape' && this.state.isMobile) this.closeSidebar();
  }
};

// Init
document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('loginScreen');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');

  // Check existing session
  if (getToken()) {
    obtenerUsuarioActual().then(user => {
      App.state.user = user;
      loginScreen.classList.add('hidden');
      App.init();
    }).catch(() => {
      clearToken();
      loginScreen.classList.remove('hidden');
    });
  }

  // Login handler
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const username = document.getElementById('loginUsername')?.value?.trim();
      const password = document.getElementById('loginPassword')?.value;
      if (!username || !password) { loginError.textContent = 'Ingresa usuario y contraseña'; return; }
      loginError.textContent = '';
      loginBtn.disabled = true;
      loginBtn.textContent = 'Ingresando...';
      loginAuth(username, password).then(data => {
        setToken(data.token);
        App.state.user = data.user;
        loginScreen.classList.add('hidden');
        App.init();
      }).catch(err => {
        loginError.textContent = err.message || 'Credenciales inválidas';
      }).finally(() => {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Iniciar Sesión';
      });
    });
    // Enter key on login
    document.getElementById('loginPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });
    document.getElementById('loginUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPassword')?.focus(); });
  }

  // Logout handler
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (!confirm('¿Cerrar sesión?')) return;
    clearToken();
    App.state.user = null;
    loginScreen.classList.remove('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  });
});

App.init = function() {
  const loginScreen = document.getElementById('loginScreen');
  const hamburger = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const darkToggle = document.getElementById('darkModeToggle');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return;
      if (sidebar.classList.contains('open')) App.closeSidebar();
      else App.openSidebar();
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => App.closeSidebar());
  }

  // Dark mode
  const savedTheme = localStorage.getItem('dpcoffee-theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (darkToggle) darkToggle.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';
  }
  if (darkToggle) {
    const updateDarkToggle = () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      darkToggle.innerHTML = isDark
        ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"></path></svg>';
    };
    updateDarkToggle();
    darkToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('dpcoffee-theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('dpcoffee-theme', 'dark');
      }
      updateDarkToggle();
    });
  }

  // Role-based UI
  const user = this.state.user;
  if (user) {
    const userSection = document.getElementById('sidebarUser');
    const userNameEl = document.getElementById('sidebarUserName');
    const userRoleEl = document.getElementById('sidebarUserRole');
    if (userSection) userSection.style.display = 'block';
    if (userNameEl) userNameEl.textContent = user.nombre;
    if (userRoleEl) {
      const roleIcon = user.rol === 'admin' ? '' : "<svg viewBox=\"0 0 24 24\"><path d=\"M6 7h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7Z\"/><path d=\"M9 7V5h6v2\"/><path d=\"M9 12h6\"/></svg>";
      userRoleEl.innerHTML = `${roleIcon} <span>${user.rol === 'admin' ? 'Administrador' : 'Vendedor'}</span>`;
    }

    // Hide admin-only menus for vendedor
    if (user.rol === 'vendedor') {
      document.querySelectorAll('.nav-link[data-tab="configuracion"]').forEach(el => el.closest('.nav-item').style.display = 'none');
    }
  }

  document.querySelectorAll('.sidebar nav button, .nav-link').forEach(btn => {
    btn.addEventListener('click', () => App.showTab(btn.dataset.tab));
  });

  document.addEventListener('click', e => App.handleClick(e));
  document.addEventListener('keydown', e => App.handleKeydown(e));
  document.addEventListener('change', e => {
    if (e.target.matches('[data-action="asignar-cuenta-select"]')) {
      const detalleId = e.target.dataset.detalleid;
      const cuenta = e.target.value;
      if (detalleId && cuenta) PedidosController.asignarCuenta(detalleId, cuenta);
    }
  });

  // ─── MVC Controllers initialization ─────────────────
  if (typeof PedidosController !== 'undefined') PedidosController.init();
  if (typeof CajaController !== 'undefined') CajaController.init();
  if (typeof PosController !== 'undefined') PosController.init();

  // Delegate key App methods to controllers (migration bridge)
  const _origVerPedido = App.verPedido;
  App.verPedido = function(pedidoId) {
    App.state.currentPedidoId = pedidoId;
    return PedidosController.verPedido(pedidoId);
  };
  App.mostrarMenuProductos = function() { return PedidosController.mostrarMenuProductos(); };
  App.confirmarCerrarPedido = function() { return PedidosController.confirmarCerrarPedido(); };
  App.confirmarCerrarPedidoPago = function() { return PedidosController.confirmarCerrarPedidoPago(); };
  App.confirmarCancelarPedido = function() { return PedidosController.confirmarCancelarPedido(); };
  App.mostrarFormEditarPedido = function() { return PedidosController.mostrarFormEditarPedido(); };
  App.guardarEdicionPedido = function() { return PedidosController.guardarEdicionPedido(); };
  App.activarSplit = function() { return PedidosController.activarSplit(); };
  App.agregarCuenta = function() { return PedidosController.agregarCuenta(); };
  App.cerrarCuenta = function(c) { return PedidosController.cerrarCuenta(c); };
  App.pagarItem = function(id) { return PedidosController.pagarItem(id); };
  App.pagarSeleccionados = function() { return PedidosController.pagarSeleccionados(); };
  App.abonarCuentaUI = function(c) { return PedidosController.abonarCuentaUI(c); };
  App.mostrarModalPagarCuenta = function(c) { return PedidosController.mostrarModalPagarCuenta(c); };
  App.mostrarModalPropina = function(pid, l, p) { return PedidosController.mostrarModalPropina(pid, l, p); };
  App.mostrarModalPropinaGeneral = function() { return PedidosController.mostrarModalPropinaGeneral(); };
  App.cargarCaja = function() { return CajaController.cargarCaja(); };
  const _origMostrarPosOrder = App.mostrarPosOrder;
  App.mostrarPosOrder = function(pid) {
    if (typeof PosController !== 'undefined') return PosController.mostrarPosOrder(pid);
    if (_origMostrarPosOrder) return _origMostrarPosOrder.call(App, pid);
    throw new Error('Módulo POS no cargado. Recargue la página.');
  };
  // POS internal methods — delegate to PosController, fallback to legacy
  // pos_order.js methods when the controller script failed to load
  // (flaky mobile network). Preserves pre-bridge originals first.
  const _origPos = {};
  ['_posAdd', '_posQty', '_posSetCat', '_posCobrar', '_posCobrarCuenta', '_posCancelar',
   '_posSplit', '_posSplitAssign', '_posSplitCancel', '_posComanda', '_posCancelarPedido',
   '_posEditarPedido', '_posRenderTicket', '_posRenderProducts', '_posRenderCats'].forEach(k => {
    if (typeof App[k] === 'function') _origPos[k] = App[k];
  });
  const _posBridge = (key, ctrlKey) => function(...args) {
    if (typeof PosController !== 'undefined' && typeof PosController[ctrlKey] === 'function') {
      return PosController[ctrlKey](...args);
    }
    if (_origPos[key]) return _origPos[key].apply(App, args);
    throw new Error('Módulo POS no cargado. Recargue la página.');
  };
  App._posAdd = _posBridge('_posAdd', '_posAdd');
  App._posQty = _posBridge('_posQty', '_posQty');
  App._posSetCat = _posBridge('_posSetCat', '_posSetCat');
  App._posCobrar = _posBridge('_posCobrar', '_posCobrar');
  App._posCobrarCuenta = _posBridge('_posCobrarCuenta', '_posCobrarCuenta');
  App._posCancelar = _posBridge('_posCancelar', '_posCancelar');
  App._posSplit = _posBridge('_posSplit', '_posSplit');
  App._posSplitAssign = _posBridge('_posSplitAssign', '_posSplitAssign');
  App._posSplitConfirm = function() { /* legacy no-op */ };
  App._posSplitCancel = _posBridge('_posSplitCancel', '_posSplitExit');
  App._posComanda = _posBridge('_posComanda', '_posComanda');
  App._posCancelarPedido = _posBridge('_posCancelarPedido', '_posCancelarPedido');
  App._posEditarPedido = _posBridge('_posEditarPedido', '_posEditarPedido');
  App._posRenderTicket = _posBridge('_posRenderTicket', '_renderTicket');
  // Bridge old _pos reads to Store
  Object.defineProperty(App, '_pos', {
    get() { return Store.get('pos'); },
    set(v) { Object.assign(Store._state.pos, v); },
    configurable: true
  });

  window.addEventListener('resize', () => {
    App.state.isMobile = window.innerWidth <= 768;
    if (!App.state.isMobile) { const s = document.querySelector('.sidebar'); if (s) s.classList.remove('open'); }
  });

  const savedTab = localStorage.getItem('copito_tab');
  const initialTab = (savedTab && App.TABS.includes(savedTab)) ? savedTab : 'dashboard';
  App.showTab(initialTab);
};
