# ☕ Copito POS — Dark Pink Coffee

Sistema POS + control de inventario (PWA instalable) para cafetería de un local.
Vanilla **PHP + MySQL + JS**, sin frameworks ni build. ~350 KB.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla (módulos por `<script>`, fachada global `App`) |
| Backend | PHP 8.1/8.2 vanilla, PDO, JWT propio (HMAC-SHA256, 24 h) |
| DB | MySQL/MariaDB, 20 tablas + migraciones |
| PWA | `manifest.json` + `sw.js` (Network-First `/api`, Cache-First estáticos) |
| Moneda / TZ | `$ COP` · `America/Bogota` |

## Puesta en marcha

1. **Base de datos**: importar `sql/dpcoffee.sql` y luego **solo las migraciones
   v4 en adelante** (ver *Esquema* más abajo).
2. **Entorno**: crear `.env` en la raíz del proyecto a partir de `.env.example`.
   Sin él **toda la API responde 500** (`DB_PASS no está definido`).

   ```env
   APP_ENV=development
   APP_ORIGIN=

   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=dpcoffee

   JWT_SECRET=<40 caracteres aleatorios, mínimo 16>
   ```

   Rutas que revisa `api/config.php:16-18`, en este orden:
   `C:\xampp\htdocs\.env` → `copito-deploy\.env` → `copito-deploy\api\.env`.
   El archivo está en `.gitignore` y **nunca** se commitea.

3. **Apache**: el vhost debe tener `AllowOverride All`, si no, **ninguna regla del
   `.htaccess` aplica** (ni los bloqueos de seguridad ni el reescritor de `/api`).
4. **PHP**: `display_errors = Off` en producción.

Acceso inicial: `admin` / `admin123` (cambiar en Configuración → Usuarios).

## Estructura

```
index.html                  SPA (13 pestañas: dashboard … configuración)
css/style.css               Diseño + responsive + modo oscuro + print 80mm
js/api.js                   Fetch + JWT + API_BASE dinámico (root/subcarpeta)
js/app.js                   Núcleo: estado, tabs, login, delegación de eventos
js/core/format.js           Fechas Bogotá, fmt, escapeHtml
js/core/ui.js               Modales, mensajes (con contenedor flotante de respaldo)
js/core/event-router.js     Despachador centralizado de acciones
js/core/pager.js            Paginador reutilizable
js/controllers/             pos_controller, pedidos_controller
js/views/                   pos_view, pedidos_view
js/modules/*.js             dashboard, productos, movimientos, reportes, buscar,
                            proveedores, mesas, caja, config, pedidos, split-bill,
                            pos_order, recetas, materia_prima, angie
js/ticket.js                Factura/comanda térmica, Recibido/Cambio
api.php                     Router /api → api/*.php (+ /health)
api/                        auth, dashboard, productos, movimientos, pedidos_*,
                            caja, usuarios, grupos, unidades, proveedores,
                            mesas, auditoria, reportes, mantenimiento, propinas
api/shared/                 auth_middleware, payment_helpers, stock_helpers,
                            order_helpers, caja_helpers, jwt, audit, validate
tests/                      run_all.php + suites (ver sección Tests)
Agente/                     Prompts de auditoría/desarrollo (NO servible por HTTP)
sql/                        Esquema base + migraciones
uploads/productos/          Imágenes runtime (hash, máx 2 MB, JPG/PNG/WEBP)
```

## Esquema

`sql/dpcoffee.sql` trae la base (auditoria, caja, caja_movimientos, detalle_pedido,
grupos, mesas, movimientos, pagos, pedidos, productos, unidades, usuarios).
Se aplican después, **en orden**:

| Archivo | Aporta | ¿Idempotente? |
|---|---|---|
| `sql/migracion_v2.sql` | columnas de cancelación, `codigo_referencia`, `imagen_url`, `pagos.usuario_id`, `movimientos.usuario_id` | ⚠️ no re-ejecutar |
| `sql/migracion_v3.sql` | `mesas.estado_manual` + semillas Mesa 4/5 | ⚠️ no re-ejecutar |
| `sql/migracion_v4_proveedores.sql` | tabla `proveedores` (+tel2/dir2/comentarios) | ✅ |
| `sql/migracion_v5_fks.sql` | 14 FKs RESTRICT + checks de huérfanos | ⚠️ no re-ejecutar |
| `sql/migracion_v6_split_cuentas.sql` | `pedidos.cuentas_activas` | ⚠️ no re-ejecutar |
| `sql/migracion_v7_propinas_recetas_angie.sql` | `propina_distribucion`, `recetas` + `pedidos.propina*` | ⚠️ no re-ejecutar |
| `sql/migracion_v7a_materia_prima.sql` | `materia_prima`, `movimientos_materia_prima`, `consumos_internos` | ✅ |
| `sql/migracion_v8_propinas_tabla.sql` | tabla `propinas`, enum `PROPINA` en `caja_movimientos` | ✅ |

Total: **20 tablas** (`login_intentos` se crea en runtime al primer login).
Todas en `utf8mb4_general_ci`.

## Uso (roles)

* **admin**: todo — usuarios, caja (abrir/cerrar/movimientos), precios y costos
  de catálogo, borrar catálogo, exportar reportes con costos, limpieza, auditoría.
* **vendedor**: ventas, mesas, movimientos, inventario. **No** puede fijar precios
  (el catálogo manda), ni operar caja, ni borrar del catálogo, ni exportar
  reportes de costos.

El rol se lee **siempre de la BD**, no del JWT: degradar a un admin surte efecto
de inmediato en vez de esperar a que venza el token (24 h).

Módulos: Dashboard (1 llamada agregada), Productos (paginado 50/pág), Movimientos
(filtros + chips Ingreso/Salida), Proveedores, Inventario, Materia Prima, Recetas,
Angie, Reportes (más vendidos, semanal, Excel), Buscar, Mesas/Pedidos (split bill,
abonos, pago por ítem, comanda), Caja (FISICO/BANCARIO, historial con bancario),
Tickets (Recibido/Cambio en efectivo, total intacto), Configuración.

## Reglas de negocio duras (verificadas)

| Regla | Dónde |
|---|---|
| El precio lo fija el catálogo; solo `admin` se desvía | `api/shared/stock_helpers.php` → `aplicarPrecioItem()` |
| Un pago parcial **no** descuenta stock de los ítems impagos | `api/shared/payment_helpers.php` → `filterFullyPaidItems()` |
| Cancelar un pedido revierte el inventario (`INGRESO`) | `api/pedidos/pedidos_crud.php` |
| No se cobra sin caja abierta (409) | `cajaAbierta()` en los 5 endpoints de pago |
| Apertura/cierre/movimiento de caja serializados (`FOR UPDATE`) | `api/caja/caja.php` |
| Importes con `round(..., 2)` (columnas `DECIMAL(*,2)`) | todo `api/` |

## Tests

```bash
php tests/run_all.php
```

* `tests/test_precios.php` — unidad pura, sin BD: 13 casos de la política de precios.
* `tests/test_seguridad.php` — solo lectura vía HTTP: bloqueos del `.htaccess`,
  autenticación, rol desde la BD y migración v8.
* `tests/CHECKLIST.md` — verificación manual de los flujos de dinero, que aún
  **no** están automatizados (`test_pagos`, `test_caja`, `test_inventario`,
  `test_auth_ratelimit`, `test_split_bill`): necesitan una BD de pruebas aparte.

Los `test_*.php` de la raíz siguen ignorados por git; los de `tests/` **sí** se
commitean (`!tests/test_*.php` en `.gitignore`).

## API (resumen)

Auth `Authorization: Bearer <JWT>`. Respuestas JSON con fechas `DD/MM/YYYY hh:mm AM/PM`.

```
POST /api/auth/login            GET /api/auth/me
GET  /api/dashboard/resumen
GET  /api/productos[?q=&page=&limit=]      POST/PUT/DELETE /api/productos…
GET  /api/grupos|unidades|proveedores     POST (DELETE requiere admin)
GET  /api/movimientos[?page=]              POST /api/movimientos
GET  /api/materia-prima|recetas|consumos-internos
GET  /api/pedidos/activos|historial[?page=]
POST /api/pedidos | /{id}/items | /{id}/cerrar | /{id}/abonar | /{id}/pagar-item(s)
PUT|DELETE /api/pedidos/items/{detalleId}
GET  /api/caja/activa|resumen|historial|propinas
POST /api/caja/abrir|movimiento|cerrar     (requiere admin)
GET  /api/propinas
GET  /api/reportes/exportar-excel?tipo=movimientos|ventas|inventario|auditoria
GET  /api/usuarios[?page=]                 (requiere admin)
GET  /api/auditoria[?page=]
```

Listados: sin `?page=` devuelven array legacy; con `?page=` devuelven
`{data, total, page, limit}`.

## Seguridad en el despliegue

El `.htaccess` bloquea con **403**: `sql/`, `.git/`, `tests/`, `Agente/`,
`docs/`, `README.md`, `router.php`, `.gitignore` y todo `.env|.sql|.log|.err`.
Verificado por `tests/test_seguridad.php`.

Errores internos **nunca** se devuelven al cliente: se guardan en el log de
Apache (`error_log`) y el cliente recibe un mensaje genérico.
