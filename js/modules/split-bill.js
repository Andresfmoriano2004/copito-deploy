// Copito POS — Asignación de items a cuentas.
// NOTA: los demás métodos legacy de este archivo fueron eliminados
// porque App.activarSplit/agregarCuenta/cerrarCuenta/pagarItem/pagarSeleccionados/
// abonarCuentaUI/mostrarModalPagarCuenta/mostrarModalPropina viven en
// js/controllers/pedidos_controller.js (puentes en js/app.js).
// Solo queda asignarCuenta (sin puente) + el registro de acciones.
// Extends the global App facade. Loaded after pedidos.js.
Object.assign(App, {

  asignarCuenta(detalleId, cuenta) {
    const pedidoId = this.state.currentPedidoId;
    if (!pedidoId) return;
    obtenerPedido(pedidoId).then(pedido => {
      const item = pedido.items.find(i => i.id == detalleId);
      if (!item) return;
      modificarItemPedido(detalleId, { cantidad: item.cantidad, precioUnitario: item.precioUnitario, notas: item.notas, cuenta })
        .then(() => { this.verPedido(pedidoId); })
        .catch(err => { this.showMessage('mesaMsg', 'Error: ' + err.message, 'error'); });
    });
  },
});

if (typeof AppEventRouter !== 'undefined') {
  AppEventRouter.registerMany({
    'activar-split': () => App.activarSplit(),
    'agregar-cuenta': () => App.agregarCuenta(),
    'asignar-cuenta': ({ button }) => App.asignarCuenta(button.dataset.detalleid, button.dataset.cuenta),
    'cerrar-cuenta': ({ button }) => App.cerrarCuenta(button.dataset.cuenta),
    'seleccionar-items-cuenta': ({ button }) => App.mostrarModalPagarCuenta(button.dataset.cuenta),
    'cerrar-cuenta-general': () => App.cerrarCuenta(null),
    'abonar-cuenta': ({ button }) => App.abonarCuentaUI(button.dataset.cuenta),
    'abonar-general': () => App.abonarCuentaUI(null),
    'pagar-item': ({ button }) => App.pagarItem(button.dataset.detalleid),
    'pagar-seleccionados': () => App.pagarSeleccionados()
  });
}
