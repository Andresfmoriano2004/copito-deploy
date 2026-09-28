// Lightweight navigation layer for the POS frontend.
// Centralizes tab activation and keeps legacy App.showTab() compatibility.
const Router = {
  currentRoute: 'dashboard',
  routes: [],

  register(routeName, handler) {
    if (!routeName) return;
    this.routes.push({ routeName, handler });
  },

  navigate(routeName) {
    if (!routeName) return;
    this.currentRoute = routeName;
    this.activate(routeName);
    const route = this.routes.find(r => r.routeName === routeName);
    if (route && typeof route.handler === 'function') {
      route.handler(routeName);
    }
  },

  bindNav(selector, onSelect) {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(btn => {
      const route = btn.dataset.tab || btn.dataset.route;
      if (!route) return;
      btn.addEventListener('click', () => {
        this.navigate(route);
        if (typeof onSelect === 'function') onSelect(route);
      });
    });
  },

  activate(routeName) {
    if (!routeName) return;
    const route = String(routeName);
    this.currentRoute = route;

    document.querySelectorAll('.tab-content').forEach(panel => {
      const isActive = panel.id === route;
      panel.style.display = isActive ? 'block' : 'none';
    });

    document.querySelectorAll('.nav-link').forEach(btn => {
      const isActive = btn.dataset.tab === route;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const titleEl = document.getElementById('pageTitle');
    if (titleEl && App && App.TAB_TITLES && App.TAB_TITLES[route]) {
      titleEl.textContent = App.TAB_TITLES[route];
    }

    if (typeof Store !== 'undefined') {
      Store.set('ui.currentTab', route);
    }
  },

  syncRoute(routeName) {
    this.activate(routeName || this.currentRoute || 'dashboard');
  }
};
