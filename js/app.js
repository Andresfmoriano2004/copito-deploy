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

  TABS: ['dashboard', 'productos', 'movimientos', 'proveedores', 'inventario', 'reportes', 'buscar', 'mesas', 'caja', 'configuracion'],

  TAB_TITLES: {
    dashboard: 'Dashboard',
    productos: 'Productos',
    movimientos: 'Movimientos',
    proveedores: 'Proveedores',
    inventario: 'Inventario',
    reportes: 'Reportes',
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
    buscar: 'cargarBuscar',
    mesas: 'cargarVistaMesas',
    caja: 'cargarCaja',
    configuracion: 'cargarConfiguracion'
  },

  METODOS_PAGO: [
    { id: 'Efectivo', label: 'Efectivo', icon: '💵', tipo: 'FISICO' },
    { id: 'Transferencia', label: 'Transferencia bancaria', icon: '🏦', tipo: 'BANCARIO' }
  ],

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
    this.TABS.forEach(t => {
      const section = document.getElementById(t);
      if (section) section.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.sidebar nav button, .nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      if (btn.dataset.tab === tab) btn.setAttribute('aria-selected', 'true');
      else btn.setAttribute('aria-selected', 'false');
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
      'agregar-item': () => this.mostrarMenuProductos(),
      'seleccionar-producto-menu': () => this.seleccionarProductoMenu(actionBtn.dataset.codigo),
      'guardar-item-menu': () => this.guardarItemMenu(),
      'eliminar-item': () => this.confirmarEliminarItem(actionBtn.dataset.detalleid),
      'editar-producto': () => this.mostrarFormModificarItem(actionBtn.dataset.detalleid),
      'guardar-mod-item': () => this.guardarModItem(actionBtn.dataset.detalleid),
      'cerrar-pedido': () => this.confirmarCerrarPedido(),
      'cancelar-pedido': () => this.confirmarCancelarPedido(),
      'editar-pedido': () => this.mostrarFormEditarPedido(),
      'guardar-edicion-pedido': () => this.guardarEdicionPedido(),
      'volver-mesas': () => this.cargarVistaMesas(),
      'cancelar-item-form': () => this.cerrarModal(),
      'descargar-factura': () => this.descargarFactura(actionBtn.dataset.pedidoid),
      'imprimir-ticket': () => this.descargarFactura(actionBtn.dataset.pedidoid || this.state.currentPedidoId),
      'imprimir-comanda': () => {
        const pId = actionBtn.dataset.pedidoid || this.state.currentPedidoId;
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
      'abrir-caja': () => this.abrirCajaHandler(),
      'registrar-mov-caja': () => this.registrarMovCaja(),
      'cerrar-caja-modal': () => this.cerrarCajaModal(),
      'confirmar-cierre-caja': () => this.confirmarCierreCaja(),
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
      }
    };
    if (actions[action]) actions[action]();
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
    if (darkToggle) darkToggle.textContent = '☀️';
  }
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('dpcoffee-theme', 'light');
        darkToggle.textContent = '🌙';
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('dpcoffee-theme', 'dark');
        darkToggle.textContent = '☀️';
      }
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
    if (userRoleEl) userRoleEl.textContent = user.rol === 'admin' ? '👑 Administrador' : '🛒 Vendedor';

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
      if (detalleId && cuenta) App.asignarCuenta(detalleId, cuenta);
    }
  });

  window.addEventListener('resize', () => {
    App.state.isMobile = window.innerWidth <= 768;
    if (!App.state.isMobile) { const s = document.querySelector('.sidebar'); if (s) s.classList.remove('open'); }
  });

  App.showTab('dashboard');
};
