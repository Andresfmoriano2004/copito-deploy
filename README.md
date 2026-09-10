# ☕ Copito POS — Dark Pink Coffee

Sistema POS + control de inventario (PWA instalable) para cafetería de un local.
Vanilla **PHP + MySQL + JS**, sin frameworks ni build. ~350 KB.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla (módulos por `<script>`, fachada global `App`) |
| Backend | PHP 8.1/8.2 vanilla, PDO, JWT propio (HMAC-SHA256, 24 h) |
| DB | MySQL/MariaDB, 12 tablas + migraciones |
| PWA | `manifest.json` + `sw.js` (Network-First `/api`, Cache-First estáticos) |
| Moneda / TZ | `$ COP` · `America/Bogota` |

## Estructura

```
index.html                  SPA (10 pestañas: dashboard…configuración)
css/style.css               Diseño + responsive + modo oscuro + print 80mm
js/api.js                   Fetch + JWT + API_BASE dinámico (root/subcarpeta)
js/app.js                   Núcleo: estado, tabs, login, delegación de eventos
js/core/format.js           Fechas Bogotá, fmt, escapeHtml
js/core/ui.js               Modales, mensajes, spinner
js/core/pager.js            Paginador reutilizable
js/modules/*.js             dashboard, productos, movimientos, reportes, buscar,
                            proveedores, mesas (pedidos/pagos), caja, config
js/ticket.js                Factura/comanda térmica, Recibido/Cambio
api.php                     Router /api → api/*.php (+ /health)
api/                        auth, dashboard, productos, movimientos, pedidos_*,
                            caja, usuarios, grupos, unidades, proveedores,
                            mesas, auditoria, reportes, mantenimiento, config
sql/dpcoffee.sql            Esquema base (12 tablas, sin FKs de origen)
sql/migracion_v2/v3.sql     auditoría, mesas, códigos MES/ADM
sql/migracion_v4_proveedores.sql  tabla proveedores (+tel2/dir2/comentarios)
sql/migracion_v5_fks.sql    14 FKs RESTRICT + checks de huérfanos
uploads/productos/          Imágenes runtime (hash, máx 2 MB, JPG/PNG/WEBP)
```

## Instalación local (Laragon)

1. Clona/copia el proyecto en la carpeta `www` de Laragon.
2. Crea la base de datos en HeidiSQL e importa en orden:
   `dpcoffee.sql` → `migracion_v2.sql` → `migracion_v3.sql` →
   `migracion_v4_proveedores.sql` → `migracion_v5_fks.sql`
3. Copia `.env.example` a `.env` y configura tus valores locales
   (host, puerto, usuario, clave, base y un `JWT_SECRET` largo generado con
   `openssl rand -hex 32`). Nunca commitees el `.env` real.
4. Abre la app en tu `http://localhost/...` y verifica `…/api/health` → `{"status":"ok"}`.
5. Entra con el usuario `admin` inicial (cambia su contraseña enseguida;
   nunca uses claves de desarrollo en producción).

## Uso (roles)

* **admin**: todo (usuarios, caja, limpieza, reportes, auditoría).
* **vendedor**: ventas, mesas, movimientos. Escritura de catálogo/caja según reglas del negocio.

Módulos: Dashboard (1 llamada agregada), Productos (paginado 50/pág), Movimientos
(filtros + chips Ingreso/Salida), Proveedores, Inventario (con foto), Reportes
(más vendidos, semanal, Excel), Buscar, Mesas/Pedidos (split bill, abonos, pago
por ítem, comanda), Caja (FISICO/BANCARIO, historial con bancario), Tickets
(Recibido/Cambio en efectivo, total intacto), Configuración.

## API (resumen)

Auth `Authorization: Bearer <JWT>`. Respuestas JSON con fechas `DD/MM/YYYY hh:mm AM/PM`.

```
POST /api/auth/login            GET /api/auth/me
GET  /api/dashboard/resumen
GET  /api/productos[?q=&page=&limit=]      POST/PUT/DELETE /api/productos…
GET  /api/movimientos[?page=]              POST /api/movimientos
GET  /api/pedidos/activos|historial[?page=]
POST /api/pedidos | /{id}/items | /{id}/cerrar | /{id}/abonar | /{id}/pagar-item(s)
GET  /api/caja/activa|resumen|historial    POST /api/caja/abrir|movimiento|cerrar
GET  /api/usuarios|proveedores|grupos|unidades|mesas|auditoria[?page=]
```
Listados: sin `?page=` devuelven array legacy; con `?page=` devuelven
`{data, total, page, limit}`.

## Despliegue en Hostinger

1. Compartido PHP 8.1/8.2 + MySQL. Sube el contenido a `public_html/`.
   **No subas:** `.env`, `sql/`, `router.php`, `api/diagnostico.php` (+ su ruta en `api.php`).
2. Crea DB/usuario en hPanel e importa los SQL en el mismo orden.
3. `.env` de producción **fuera** de `public_html` (un nivel arriba, donde tu
   hosting lo permita). Usa los `DB_*` que te da el panel, un `JWT_SECRET`
   nuevo y largo, y `APP_ORIGIN=https://tudominio.com`.
4. Activa SSL + redirect 80→443, verifica `uploads/productos/` escribible (755).
5. Post-deploy: `/api/health` → ok, `/.env` → 403, login, producto con foto,
   pedido + pago mixto, caja FISICO/BANCARIO, ticket con hora Bogotá.

## Notas

* Integridad referencial vía FKs `RESTRICT` (borrar producto con ventas → `409`).
* Auditoría de operaciones sensibles en tabla `auditoria`.
* Sin `console.log` de debug en producción; `CACHE_NAME` en `sw.js` se sube por versión.
