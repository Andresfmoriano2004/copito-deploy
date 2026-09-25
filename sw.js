const CACHE_NAME = 'copito-pos-v1.38';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/api.js',
  './js/ticket.js',
  './js/app.js',
  './js/core/store.js',
  './js/views/pedidos_view.js',
  './js/views/caja_view.js',
  './js/views/pos_view.js',
  './js/controllers/pedidos_controller.js',
  './js/controllers/caja_controller.js',
  './js/controllers/pos_controller.js',
  './js/core/format.js',
  './js/core/ui.js',
  './js/core/pager.js',
  './js/core/api-pedidos.js',
  './js/core/api-caja.js',
  './js/core/api-productos.js',
  './js/core/api-inventario.js',
  './js/core/api-mesas.js',
  './js/core/api-propinas.js',
  './js/core/api-usuarios.js',
  './js/core/api-reportes.js',
  './js/modules/dashboard.js',
  './js/modules/productos.js',
  './js/modules/movimientos.js',
  './js/modules/reportes.js',
  './js/modules/buscar.js',
  './js/modules/proveedores.js',
  './js/modules/mesas.js',
  './js/modules/pedidos.js',
  './js/modules/split-bill.js',
  './js/modules/caja.js',
  './js/modules/config.js',
  './js/modules/materia_prima.js',
  './js/modules/recetas.js',
  './js/modules/angie.js',
  './js/modules/pos_order.js',
  './manifest.json',
  './icons/icon.svg'
];

// Instalación: Cachear assets estáticos iniciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpiar TODOS los cachés antiguos de un solo golpe
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network First para API, Stale-While-Revalidate para estáticos
self.addEventListener('fetch', event => {
  // Ignorar esquemas no soportados por Cache Storage (chrome-extension:, etc.)
  if (!event.request.url.startsWith('http:') && !event.request.url.startsWith('https:')) {
    return;
  }

  const url = new URL(event.request.url);

  // Forzar HTTPS: si la petición es HTTP y estamos en un contexto HTTPS, redirigir
  if (url.protocol === 'http:' && self.location.protocol === 'https:') {
    event.respondWith(fetch(event.request.url.replace('http:', 'https:')));
    return;
  }

  // Solicitudes API van directo a la red (sin caché para evitar datos obsoletos de ventas/stock)
  if (url.pathname.includes('/api') || url.pathname.includes('.php')) {
    event.respondWith(
      fetch(event.request).catch(err => {
        const online = typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true;
        const msg = online
          ? 'El servidor no responde. Reintente en unos minutos.'
          : 'Sin conexión con el servidor. Verifica tu red.';
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'X-SW-Offline': '1' } }
        );
      })
    );
    return;
  }

  // Assets estáticos (HTML, CSS, JS, imágenes): Cache first con actualización en segundo plano
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache).catch(() => {});
          }).catch(() => {});
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
