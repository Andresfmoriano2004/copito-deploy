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

