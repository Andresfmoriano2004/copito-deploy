# 🤖 Agentes de Copito POS

Los prompts que vivían aquí (`agente-frontend-copito-prompt.md`,
`debug-copito-prompt.md`, `nueva-funcionalidad-copito-prompt.md` y
`auditoria-pos-prompt.md`) se **promovieron a agentes reales** de OpenCode en
[`../.opencode/agents/`](../.opencode/agents/). Este directorio queda como índice:
esta carpeta sigue bloqueada con **403** en despliegue (`.htaccess`, regla
`^(tests|Agente|docs)(/|$)`), igual que antes.

## Los cuatro agentes

| Agente | Archivo | Para qué sirve |
|---|---|---|
| `copito-frontend` | [.opencode/agents/copito-frontend.md](../.opencode/agents/copito-frontend.md) | Pantallas, estilos y estados de UI en el frontend vanilla. **No toca PHP ni la BD.** |
| `copito-debug` | [.opencode/agents/copito-debug.md](../.opencode/agents/copito-debug.md) | Reproduce un bug, lo lleva a causa raíz con evidencia `archivo:línea` y aplica el fix mínimo en rama `fix/<bug-corto>`. |
| `copito-funcionalidad` | [.opencode/agents/copito-funcionalidad.md](../.opencode/agents/copito-funcionalidad.md) | Funcionalidad nueva de punta a punta: diseño → backend → frontend → pruebas, con las reglas de dinero y stock. |
| `copito-auditoria` | [.opencode/agents/copito-auditoria.md](../.opencode/agents/copito-auditoria.md) | Auditoría técnica en **solo lectura** (arquitectura, OWASP, integridad monetaria, BD) que termina en `docs/auditoria/`. |

## Cómo invocarlos

Todos tienen `mode: all`, así que sirven de las dos formas:

- **Como agente principal:** `/agent copito-frontend` y trabaja con él.
- **Como subagente:** *"Usa el agente copito-debug para …"* y lo lanza en una
  sesión hijo con contexto limpio.

Los tres primeros heredan los permisos normales. `copito-auditoria` lleva
permisos explícitos en su frontmatter: **no puede editar nada fuera de
`docs/`** y cada comando de shell pide aprobación — así la regla *"solo lectura
hasta que yo apruebe el plan"* deja de depender de que el modelo obedezca.

> Abre de nuevo OpenCode (o reinicia el servicio) la primera vez: los agentes se
> descubren al arrancar, así que no aparecen en el catálogo hasta el próximo
> reinicio.

## Qué cambió al migrarlos

Dos líneas de los prompts ya no eran ciertas:

1. **`node -c` ya no se puede usar** — no hay Node.js instalado en esta máquina.
   En los tres agentes que lo pedían se reemplazó por *"`php -l` en PHP y cargar
   la app para revisar la consola del navegador"*.
2. **La regla de `@keyframes` ahora tiene una excepción escrita.** Los prompts
   decían *"prohibidos `@keyframes`/animaciones"*. Tras la decisión tomada en
   esta rama, el texto ahora dice que se permiten **salvo `spin`**: es el único
   `@keyframes` de `css/style.css`, el indicador de carga `.loading-spinner`, y
   sin él el usuario no sabe si algo está fallando. Los otros seis se quitaron.

Si se edita cualquiera de los dos puntos, hay que actualizar **los cuatro
archivos** de `.opencode/agents/`.
