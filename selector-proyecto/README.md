# selector-proyecto — elegir proyecto desde Telegram

Agrega al plugin de Telegram un comando para **cambiar de proyecto del harness
desde el teléfono, eligiendo de una lista con botones**.

> **En este repo ya viene aplicado.** El fork del plugin (`plugins/dsh-telegram/`)
> incluye el selector: quien instala con `install/install.sh` lo tiene andando sin
> hacer nada. Esta carpeta existe para (a) **volver a aplicarlo** si actualizás el
> plugin (una actualización pisa el `lib/` compilado), y (b) leerlo o proponerlo
> upstream.

## Qué agrega

```
/cambiarproyecto      (también /proyecto y /proyectos)
```

El bot contesta con la lista de proyectos del harness (los mismos que se ven en el
panel lateral) como botones, marca con ✅ en el que estás, y al tocar uno:

1. guarda esa carpeta como la carpeta de trabajo de ese chat,
2. arranca una conversación nueva que corre ahí,
3. avisa en qué carpeta quedó.

Es exactamente lo que ya hacía `/cd <ruta>`, pero sin tener que recordar y tipear
la ruta. Elegir un proyecto es lo mismo que `cd` a esa carpeta: el cwd de una
sesión se fija cuando la sesión abre y el sandbox deriva de ahí su raíz
escribible, así que cambiar de carpeta implica abrir una conversación nueva (la
anterior no se pierde: sigue en `/sessions`).

## Por qué así

- **Botones y no `/proyecto 3`**: la lista ya está en pantalla; pedir que alguien
  lea un índice y escriba un número es hacerle el trabajo a la computadora. Es el
  mismo criterio que usa el selector de `/sessions` del propio plugin, y el
  parche está escrito para parecerse a ese código.
- **La lista sale del registro de proyectos**, no de una lista propia: primero
  `ctx.get('workspaceRegistry').list()` (el servicio del paquete
  `@deepseek-ai/dsh-workspace`), y si ese servicio no está montado se lee el
  archivo durable `$DSH_HOME/storages/workspace.json` (sólo lectura). Si no hay
  ninguno de los dos, avisa y no toca nada.
- **Un cambio de proyecto es un cambio de carpeta**: no inventa estado nuevo.

## Archivos

| Archivo | Qué es |
|---|---|
| `projects.js` | El selector (`ProjectPicker`). Se copia a `lib/session/projects.js`. |
| `cambiarproyecto.patch` | El diff contra `lib/` del plugin (para leer o proponer upstream). |
| `apply.sh` | Aplica (idempotente) o revierte (`--rollback`) el parche. También `--check`. |
| `reload-and-verify.sh` | Reinicia `dsh-web` en un momento sin actividad, verifica y revierte si el plugin no levanta. |

## Reaplicarlo (después de actualizar el plugin)

```bash
bash selector-proyecto/apply.sh              # aplica (idempotente); --check para ver si ya está
systemd-run --collect --unit=telegram-proyecto-reload \
  /bin/bash selector-proyecto/reload-and-verify.sh
```

El plugin se carga al arrancar `dsh-web`, así que el código nuevo necesita ese
reinicio. Por eso la recarga va desacoplada con `systemd-run`: reiniciar desde
dentro de la propia conversación la cortaría en el medio (y espera un momento sin
actividad antes de reiniciar).

Deshacer: `bash selector-proyecto/apply.sh --rollback` y volver a recargar.

## Variables de entorno (opcionales)

Todas tienen un valor por defecto razonable; sirven para instalaciones que no
están en `~/.dsh` con el servicio `dsh-web`:

| Variable | Para qué |
|---|---|
| `DSH_HOME` | Dónde vive el harness (def. `~/.dsh`) |
| `DSH_TELEGRAM_LIB` | Ruta al `lib/` del plugin, si no está en el perfil `web` |
| `DSH_SERVICE` | Nombre del servicio systemd (def. `dsh-web`) |
| `DSH_RELOAD_LOG` | Dónde loguea la recarga (def. `/tmp/dsh-reload-proyecto.log`) |

## Cómo funciona (para quien lo lea o lo lleve upstream)

Cuatro cambios, todos aditivos:

1. **`lib/session/projects.js`** — nuevo. `offer(target)` arma el teclado con
   `options.surface.send(target, html, keyboard)` y espera la presión con
   `options.pending.open({})`; `handleCallback(data)` reconoce el
   `callback_data` (`p:<token>:<index>`, muy por debajo del límite de 64 bytes) y
   lo resuelve con `pending.settle`. Al elegir: `inspect` → `set` → `reset`.
2. **`lib/index.js`** — construye el selector y se lo pasa al router como
   `projects`, con `home`, `current`, `inspect`, `set`, `reset` y
   `registry: () => ctx.get('workspaceRegistry')`.
3. **`lib/router.js`** — atiende los tres nombres del comando (sin `await`,
   igual que `/sessions`: el poller tiene que seguir recibiendo para poder
   entregar el botón que resuelve la espera) y suma el selector a la cadena de
   `onCallback`.
4. **`lib/commands.js`** — una línea en `COMMANDS`, que es lo que arma el menú
   del teléfono y el `/help`. El menú que publica `install/install.sh`
   (`install/bot-commands.json`) incluye el comando.

## Límites conocidos

- Muestra los primeros **8** proyectos (los teclados de Telegram se vuelven
  inusables mucho antes).
- Sin el paquete `dsh-workspace` montado, cae al archivo durable; sin ninguno de
  los dos, el comando sólo avisa.
- El parche es sobre el `lib/` compilado del plugin: después de **cada
  actualización del plugin** hay que volver a correr `apply.sh` (es idempotente).
- Si querés proponerlo upstream, el cambio natural es llevar `projects.js` al
  código fuente (TypeScript) del plugin, al lado de `picker.ts`, y sumar
  `cambiarproyecto` a su `COMMANDS`.

## English summary

Adds `/cambiarproyecto` (aliases `/proyecto`, `/proyectos`) to the Telegram
plugin: an inline keyboard listing the harness projects (`Workspace` records from
`@deepseek-ai/dsh-workspace`, read via `ctx.get('workspaceRegistry').list()` with
the durable `$DSH_HOME/storages/workspace.json` as a read-only fallback). Picking
one records that directory for the chat and resets the conversation, exactly like
`/cd <path>` but without typing a path. Built as a thin sibling of the plugin's
own `/sessions` picker. The fork shipped in `plugins/dsh-telegram/` already has it
applied; `apply.sh` (idempotent, with `--rollback` and `--check`) re-applies it to
the compiled `lib/` after a plugin update, and `reload-and-verify.sh` performs the
`dsh-web` restart off a quiet moment and rolls back if the plugin fails to load.
