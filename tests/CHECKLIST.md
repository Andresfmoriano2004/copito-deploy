# ☕ Copito POS — Lista de verificación manual

**392 aserciones ya están automatizadas** en `php tests/run_all.php` (precios,
pago parcial, reversión de stock, arqueo, inventario, límite de intentos de login,
cuentas partidas, recetas con insumos y stock híbrido, facturación, recetas de
preparación y superficie pública). Aquí solo queda lo que la suite no puede
comprobar: lo que depende de la interfaz, de un usuario `vendedor` real o de dos
personas a la vez.

Las filas marcadas 🤖 tienen su equivalente en código (`tests/<suite>.php`) y ya
pasan; quedan como referencia de qué se probó y qué no.

Leyenda: ✅ pasar · ❌ no pasar · ⛔ requiere dos personas o caja aparte · 🤖 automatizado

---

## 1. Integridad monetaria

> 🤖 **`tests/test_pagos.php` (21 aserciones) y `tests/test_caja.php` (26)**
> cubren los apartados 1.2 a 1.5 contra una BD aislada (`dpcoffee_test`).
> Lo que sigue añadido son las partes que solo se ven en pantalla.

### 1.1 El vendedor no puede fijar precio
| # | Paso | Esperado |
|---|---|---|
| 1 | Entrar como `vendedor` (no `admin`) |
| 2 | Agregar un producto al pedido cambiando el precio por uno menor | ❌ 403 *"El precio (X) no coincide con el catálogo (Y). Solo un administrador puede aplicar otro precio."* |
| 3 | Repetir sin tocar el precio | ✅ se agrega normal |
| 4 | Entrar como `admin` y repetir el paso 2 | ✅ acepta el precio libre |

> La lógica del paso 2 está cubierta automáticamente en `tests/test_precios.php`;
> aquí se verifica el mensaje en pantalla y que el cajero pueda reaccionar.

### 1.2 Cierre parcial no descuenta stock de lo no pagado
| # | Paso | Esperado |
|---|---|---|
| 1 | Anotar el stock actual de un producto con stock alto |
| 2 | Pedir **2 unidades** de ese producto y de otro |
| 3 | Pagar **solo la mitad** del total (`/pedidos/{id}/cerrar` o abono parcial) |
| 4 | Revisar `Movimientos` | ❌ **solo** el ítem saldado genera `SALIDA` |
| 5 | Revisar la comanda | ❌ el ítem impago sigue **editable** (no queda bloqueado) |
| 6 | Revisar el stock | ❌ el ítem impago **no** descuenta inventario |

### 1.3 Cancelación revierte inventario
| # | Paso | Esperado |
|---|---|---|
| 1 | Abrir un pedido, agregar items y **cobrarlo completo** |
| 2 | Anotar el stock (habrá bajado) |
| 3 | Cancelar el pedido con motivo | ✅ mensaje indica *"Se reversó inventario de N item(s)"* |
| 4 | Revisar `Movimientos` | ✅ aparece un `INGRESO` por cada ítem cobrado |
| 5 | Revisar el stock | ✅ vuelve al valor del paso 1 |
| 6 | Revisar la comanda | ✅ los ítems quedan en `pagado = false` |
| 7 | Revisar `Caja` | ✅ el EGRESO compensatorio sigue existiendo (el dinero se devolvió) |

### 1.4 Cobro bloqueado sin caja abierta
| # | Paso | Esperado |
|---|---|---|
| 1 | Cerrar la caja (si hay alguna abierta) |
| 2 | Intentar cobrar un pedido | ❌ 409 *"No hay caja abierta. Abra caja antes de registrar cobros."* |
| 3 | Abrir caja y repetir | ✅ el cobro pasa y **aparece en el arqueo** |

⛔ Antes de esta fase el cobro se registraba en `pagos` y **no** entraba al
arqueo: si ya tenías cajones cuadrados a mano, revisa que no haya pagos
huérfanos previos a la fecha de este cambio.

### 1.5 Caja: apertura, movimiento y cierre
| # | Paso | Esperado |
|---|---|---|
| 1 | Abrir caja dos veces seguidas (dos pestañas) | ❌ la segunda dice *"Ya hay una caja abierta"* |
| 2 | Registrar un `INGRESO` y un `EGRESO` | ✅ entran ambos al resumen |
| 3 | Cerrar con un monto físico distinto al esperado | ✅ calcula la diferencia; se guarda `monto_esperado`, `monto_fisico` y `diferencia` |
| 4 | Cerrar con la caja ya cerrada (dos pestañas) | ❌ 409 *"La caja ya no está abierta"* |
| 5 | Registrar un movimiento justo mientras otro cierra | ✅ uno espera al otro; nunca se pierde un movimiento |

> Los pasos 1-4 de esta tabla están 🤖 automatizados (26 aserciones en
> `tests/test_caja.php`). El paso 5 **no**: necesita dos sesiones abiertas a la
> vez, y el código solo está protegido por el `FOR UPDATE` de `caja.php`
> (apertura, movimiento y cierre). Es el único caso que hay que provocar a mano.

### 1.6 Redondeo
| # | Paso | Esperado |
|---|---|---|
| 1 | Guardar un producto con precio `7990.55` y costo `1234.56` | ✅ se guardan **con decimales** (antes `round()` los truncaba a entero) |
| 2 | Revisar `productos.precio` y `productos.costo` en la BD | ✅ `7990.55` y `1234.56` |

---

## 2. Autorización por rol

| # | Paso | Esperado |
|---|---|---|
| 1 | Entrar como `vendedor` e intentar **abrir** caja | ❌ 403 *"No tienes permiso"* |
| 2 | Intentar **cerrar** caja / registrar movimiento | ❌ 403 |
| 3 | Intentar **editar el precio** de un producto | ❌ 403 |
| 4 | Intentar **borrar** producto / grupo / unidad / proveedor | ❌ 403 |
| 5 | Intentar **exportar** Reportes → Movimientos / Ventas / Inventario | ❌ 403 |
| 6 | Exportar Reportes → **Auditoría** (suyos) | ✅ permitido |
| 7 | Ver caja / productos / pedidos con `vendedor` | ✅ permitido (solo lectura) |

⛔ **Hace falta un usuario `vendedor`.** La BD solo tiene `admin` (rol `admin`),
así que estos casos **no** se pueden probar todavía. Para habilitarlos:

```sql
-- Revisar primero: no debe existir ya un vendedor
SELECT id, username, rol, activo FROM usuarios;
```
Crear el usuario desde **Configuración → Usuarios** con rol `vendedor`, probar,
y dejarlo `activo = 0` al terminar (no borrarlo si ya se usó: sus movimientos
quedarían huérfanos).

### 2.1 El rol se toma de la BD (automatizado ✅)
`tests/test_seguridad.php` verifica que un JWT firmado con `rol=vendedor`
para un usuario que **es** `admin` en la BD sigue teniendo acceso: si el rol
viniera del token, la degradación tardaría hasta 24 h en aplicarse.

---

## 3. Exposición pública (automatizado ✅)

Cubierto por `tests/test_seguridad.php`: `.git/`, `tests/`, `Agente/`,
`README.md`, `sql/*.sql`, `router.php`, `.gitignore` y `.env` devuelven **403**,
mientras `index.html` y `sw.js` siguen en 200.

**Pendiente de comprobar en cada despliegue** (no es automatable desde la suite):

| # | Paso | Esperado |
|---|---|---|
| 1 | `curl -s -o /dev/null -w "%{http_code}" https://<dominio>/.env` | 403 |
| 2 | `curl -s -o /dev/null -w "%{http_code}" https://<dominio>/.git/HEAD` | 403 |
| 3 | `BASE_URL=https://<dominio> php tests/test_seguridad.php` → todo verde | ya automatizado: sin `AllowOverride All` el `.htaccess` no aplica, `/README.md` deja de dar 403 y falla la aserción *«Apache lee el .htaccess (AllowOverride All en el vhost)»* junto con todos los bloqueos |
| 4 | Revisar que `display_errors = Off` en `php.ini` de producción | — |

---

## 4. Frontend

| # | Paso | Esperado |
|---|---|---|
| 1 | Tras desplegar: cerrar y abrir la PWA / `Ctrl+Shift+R` | ✅ service worker toma la versión nueva (`CACHE_NAME v1.48`) |
| 2 | Provocar un error (apagar la API) y navegar | ✅ aparece un **toast rojo**; nunca se queda la pantalla en blanco |
| 3 | Cancelar carrito con items ya sincronizados y la API caída | ✅ aviso de que no se pudieron quitar, el ítem **no** desaparece en silencio |
| 4 | Cobrar con la API caída a mitad del borrado de items | ✅ alerta y se aborta el cobro (evita doble cobro) |

---

## 5. Pendiente de esta rama

- [x] `tests/test_pagos.php` y `tests/test_caja.php` — escritas y en verde
      (47 aserciones) sobre `dpcoffee_test`, con guardas de aislamiento.
- [x] README actualizado: 20 tablas, 13 pestañas, `.env` obligatorio y el
      orden **real** de migraciones.
- [x] Suites `test_inventario` (34), `test_auth_ratelimit` (27) y
      `test_split_bill` (43) — escritas, en `run_all.php` y en verde sobre
      `dpcoffee_test`. Al escribirlas destaparon **dos bugs reales**:
      1. `api/inventario/materia_prima.php:36` declara `GET materia-prima/(.+)`
         **antes** que `GET materia-prima/historial/(.+)`, así que la ruta
         genérica enganchaba el historial y devolvía siempre *404 Materia prima
         no encontrada*: el modal de historial de la pestaña de inventario nunca
         cargó. Corregido con `([^/]+)`.
      2. `api/auth/auth.php:26` seleccionaba solo `intentos, bloqueado_hasta`,
         **sin `ultimo_intento`**. El `?? 'now'` de la ventana deslizante caía en
         `now` y `$ultimoTs < time() - 900` nunca se cumplía: los fallos viejos
         se acumulaban para siempre y esa rama era código muerto. Corregido.
- [x] **Fase 6 (v11): la receta manda el stock y el costo.** `recetas` ya
      guardaba insumo + cantidad desde v7a, pero nada la usaba: un producto «con
      receta» seguía exigiendo stock de terminado y no había ningún costo
      calculado. Ahora, al cobrar, un producto con receta **se fabrica** (baja
      materia prima y el terminado no se mueve); sin receta sigue mandando el
      terminado; si falta insumo la venta se bloquea nombrando la materia prima;
      cancelar devuelve exactamente lo consumido; y `GET /recetas/costos` expone
      `Σ(cantidad × costo)` con margen y margen % sobre precio.
      **Sin migración v11**: era solo comportamiento, todo lo que hace falta ya
      existía. Detalle: la cantidad mínima de un insumo pasó de `0.001` a
      `0.01` — `movimientos_materia_prima.cantidad` es `DECIMAL(12,2)`, y
      `0.001` se redondeaba a `0` al consumir, o sea que la receta existía pero
      no consumía nada. **54 aserciones** en `tests/test_recetas_insumos.php`.
- [x] **Tercer bug destapado: `detalleId` era siempre `0`.**
      `POST /pedidos/{id}/items` devolvía `(int)$pdo->lastInsertId()` **después**
      del `commit()`, y en MariaDB 10.4 `commit()` (y un `UPDATE`) deja
      `LAST_INSERT_ID()` en 0. El POS recibía `detalleId: 0` → en
      `pos_controller.js:273`, `res.detalleId || res.id` caía a `undefined`, el
      carrito nunca se marcaba sincronizado y volvía a reintentar el sync
      (y a borrar `items/undefined`). Idem `POST /usuarios`: devolvía el id de
      `auditoria`, no el del usuario nuevo. Corregidos capturando el id justo
      después del `INSERT` — el mismo criterio que ya seguían `caja.php` y
      `proveedores.php:49`.
- [x] `Agente/*.md` → agentes reales en `.opencode/agents/` (la ruta documentada
      es `agents`, en plural). Los cuatro con `mode: all`, y `copito-auditoria`
      con permisos que le impiden editar fuera de `docs/` y le obligan a pedir
      aprobación para cada comando de shell. `Agente/README.md` queda como índice.
      De paso: **`.opencode/` no estaba en el `.htaccess`**, así que los agentes
      se habrían servido por HTTP describiendo el modelo de seguridad; ya está en
      la lista de rutas bloqueadas. Al migrar se corrigieron dos líneas de los
      prompts que ya no eran ciertas (`node -c` no existe aquí y la regla de
      `@keyframes` ahora admite `spin`).
- [ ] Migraciones `v5`, `v6`, `v7` no son idempotentes: re-ejecutarlas rompe.
      *(Decidido el 2026-10-07: fuera de esta tanda — se dejan como pendiente.)*
      `v4`, `v7a` y `v8` sí se pueden correr varias veces.
      **`v2` y `v3` ya no aplican en instalación nueva**: están consolidadas en
      `sql/dpcoffee.sql`, así que ejecutarlas después falla con *Duplicate column
      name*. Verificado empíricamente — `dpcoffee.sql` + `v4→v8` deja los 19
      tablas esperados (`login_intentos` se crea en runtime).
- [x] Bloques `catch` vacíos en JS — los cinco cerrados: `js/app.js:102`
      (localStorage → `console.warn`, no es bloqueante), `js/modules/angie.js:156`
      (avisa que la consulta del catálogo falló en vez de decir "producto no
      encontrado"), `js/modules/pos_order.js:71` y `:394` (carga del pedido y
      borrado de ítems: ambos abortan) y `js/controllers/pos_controller.js:56`.
      Los dos críticos (`_posSyncCart` y `_posCancelar`) ya sí avisan.
- [x] 7 `@keyframes` en CSS → decisión: **se conserva solo `spin`** (el
      indicador de carga real, `.loading-spinner`) y se retiran los otros seis:
      `fadeIn`, `pulse-border`, `glow-total`, `modalSlideUp`, `pulse-abierto` y
      `cajaPulse`. Dos ni siquiera corrían (`.pedido-total-box` y
      `.caja-estado-dot.pulse` no existen en ningún HTML ni JS). Los otros cuatro
      arrancaban desde `display:none` (`.tab-content`, `.ticket-modal-content`)
      o eran bucles infinitos decorativos (`.lugar-card.en-pago`,
      `.badge-abierto`), así que no admiten `transition` sin JS: la interfaz
      ahora entra en seco. La excepción queda documentada en `css/style.css`
      junto al `spin` y en la sección de transiciones.
