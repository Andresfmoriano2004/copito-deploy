// Copito POS — Centralized observable store.
// Replaces scattered App.state, App._pos, App.gastoData, etc.
// Controllers subscribe to paths and re-render explicitly.
const Store = {
  _state: {
    // Global
    user: null,
    currentTab: 'dashboard',
    isMobile: window.innerWidth <= 768,

    // Pedidos domain
    pedidos: {
      currentId: null,
      current: null,
      cuentas: ['A', 'B'],
      currentCuentaSeleccionada: null,
      currentCuentasPedido: [],
      splitMode: false,
      mesaMode: 'activas',
      pedidosActivos: []
    },

    // Caja domain
    caja: {
      isOpen: false,
      resumen: null,
      historial: [],
      movimientos: []
    },

    // POS domain
    pos: {
      cart: [],
      category: 'Todos',
      pedidoId: null,
      pedidoData: null,
      splitMode: false,
      cuentas: [],
      originalDetalleIds: [],
      productos: [],
      categorias: []
    },

    // UI
    ui: {
      modalOpen: false,
      loading: false
    }
  },

  _listeners: [],

  get(path) {
    if (!path) return this._state;
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  },

  set(path, value) {
    const keys = path.split('.');
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._notify(path);
  },

  // Batch multiple sets, notify once per path
  batch(updates) {
    Object.entries(updates).forEach(([path, value]) => {
      this.set(path, value);
    });
  },

  subscribe(path, fn) {
    const listener = { path, fn };
    this._listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  },

  _notify(changedPath) {
    const changedParts = changedPath.split('.');
    this._listeners.forEach(l => {
      const listenerParts = l.path.split('.');
      // Notify if listener path is a prefix of changedPath or vice versa
      // but only when they share the same domain root
      const isPrefix = changedParts.slice(0, listenerParts.length).join('.') === l.path
        || listenerParts.slice(0, changedParts.length).join('.') === changedPath;
      if (isPrefix) {
        try { l.fn(this._state); } catch (e) { console.error('Store listener error:', e); }
      }
    });
  }
};
