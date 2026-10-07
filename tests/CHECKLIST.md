# ☕ Copito POS — Lista de verificación manual

Lo que la suite automatizada (`php tests/run_all.php`) **no** cubre todavía.
Ejecutar sobre un entorno con datos de prueba, nunca sobre caja real abierta
con dinero del día.

Leyenda: ✅ pasar · ❌ no pasar · ⛔ requiere dos personas o caja aparte

---

## 1. Integridad monetaria

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
| 3 | Revisar que Apache tenga `AllowOverride All` en el vhost (sin eso, el `.htaccess` **no aplica** y todo lo anterior devuelve 200) |
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

- [ ] Suites `test_pagos`, `test_caja`, `test_inventario`, `test_auth_ratelimit`,
      `test_split_bill` (declaradas en `tests/run_all.php`, aún sin escribir).
      Necesitan una **BD de pruebas aparte**: crean pedidos, abren caja y
      mueven stock real.
- [ ] `Agente/*.md`: promover los prompts a agentes reales en `.opencode/agent/`
      y añadir un `Agente/README.md` índice.
- [ ] README desactualizado (ver `docs/auditoria/`).
- [ ] Migraciones `v2`, `v3`, `v5`, `v6`, `v7` no son idempotentes: re-ejecutarlas
      rompe. `v4`, `v7a` y `v8` sí se pueden correr varias veces.
- [ ] Bloques `catch` vacíos en JS que siguen sin reportar nada:
      `js/app.js:102` (localStorage), `js/modules/angie.js:156`,
      `js/modules/pos_order.js:71` y `:394` (este último borra items del pedido),
      `js/controllers/pos_controller.js:56`.
      Los dos críticos (`_posSyncCart` y `_posCancelar`) ya sí avisan.
- [ ] 7 `@keyframes` en CSS, prohibidos por las reglas del proyecto — pero
      incluyen el spinner, que **es** funcional. Decidir si se relaja la regla o
      se reimplementa sin animación; no se han tocado para no romper la UI.
