const CACHE_NAME = 'copito-pos-v1.23';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/api.js',
  './js/ticket.js',
  './js/app.js',
  './js/core/format.js',
  './js/core/ui.js',
  './js/core/pager.js',
  './js/modules/dashboard.js',
  './js/modules/productos.js',
  './js/modules/movimientos.js',
  './js/modules/reportes.js',
  './js/modules/buscar.js',
  './js/modules/proveedores.js',
  './js/modules/mesas.js',
  './js/modules/caja.js',
  './js/modules/config.js',
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

// Activación: Limpiar cachés antiguas
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
  const url = new URL(event.request.url);

  // Solicitudes API van directo a la red (sin caché para evitar datos obsoletos de ventas/stock)
  if (url.pathname.includes('/api') || url.pathname.includes('.php')) {
    event.respondWith(
      fetch(event.request).catch(err => {
        // fetch solo rechaza si NO hubo respuesta HTTP (corte, servidor caído,
        // conexión rehusada). Se distingue sin-red-local de servidor-que-no-responde.
        const online = typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true;
        const msg = online
          ? 'El servidor no responde. Reintente en unos minutos.'
          : 'Sin conexión con el servidor. Verifica tu red.';
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
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
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
