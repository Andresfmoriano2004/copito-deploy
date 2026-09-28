// Centralized action dispatcher for the UI.
// This is a small step toward removing giant action tables from App.handleClick.
const AppEventRouter = {
  handlers: {},

  register(actionName, handler) {
    if (!actionName || typeof handler !== 'function') return;
    this.handlers[actionName] = handler;
  },

  registerMany(actions) {
    Object.entries(actions).forEach(([actionName, handler]) => {
      this.register(actionName, handler);
    });
  },

  dispatch(actionName, payload) {
    const handler = this.handlers[actionName];
    if (!handler) return false;

    try {
      const result = handler(payload);
      return result !== undefined ? result : true;
    } catch (error) {
      console.error(`[AppEventRouter] Error ejecutando acción: ${actionName}`, error);
      if (typeof App !== 'undefined' && typeof App.showMessage === 'function') {
        App.showMessage('globalMsg', 'No se pudo completar la acción solicitada.', 'error');
      }
      return false;
    }
  }
};
