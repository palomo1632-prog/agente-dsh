# MODIFICACIONES.md — qué cambió respecto a los plugins originales

Este repo incluye **forks** de dos plugins de terceros. Ambos son MIT; el crédito
y las licencias originales se mantienen. Este archivo explica qué se tocó y por qué.
El diff exacto está en [`MODIFICACIONES.diff`](MODIFICACIONES.diff).

## 1. `plugins/dsh-telegram/` — fork de [@sympoies/dsh-telegram](https://github.com/sympoies/dsh-plugins) 0.7.0

Base: la versión 0.7.0 publicada en npm, modificada en 8 archivos (7 modificados
y 1 nuevo):

| Archivo | Qué se cambió |
|---|---|
| `lib/commands.js` | Menú de comandos del bot redactado en español + `/cambiarproyecto` |
| `lib/index.js` | Respuestas del bot en español + ajustes de arranque + construye el selector de proyectos |
| `lib/client.js` | Correcciones en el manejo de la sesión de Telegram |
| `lib/router.js` | Atiende `/cambiarproyecto` (y `/proyecto`, `/proyectos`) y los botones del selector |
| `lib/session/projects.js` | **Nuevo**: el selector de proyectos (`ProjectPicker`) |
| `lib/harness/questions-seam.js` | Fix en el paso de preguntas del harness (los botones de pregunta) |
| `lib/interact/questions.js` | Ídem, lado UI de preguntas |
| `lib/interact/approvals.js` | Aprobaciones (botones sí/no) en español |

Objetivo: que un usuario hispanohablante vea TODO el bot en su idioma, que el
flujo pregunta/respuesta con botones sea confiable, y que se pueda **cambiar de
proyecto del harness desde el teléfono** sin tipear rutas.

### Selector de proyectos (`/cambiarproyecto`)

El bot ofrece los proyectos del harness (los Workspaces del panel) como botones;
al tocar uno, guarda esa carpeta para el chat y abre una conversación nueva ahí.
Es lo mismo que `/cd` con esa ruta, sin acordarse de la ruta. Cómo funciona, cómo
reaplicarlo después de actualizar el plugin y cómo revertirlo:
[`selector-proyecto/README.md`](../selector-proyecto/README.md).

El menú del teléfono lo publica `install/install.sh` desde
`install/bot-commands.json`, que ya incluye el comando.

⚠️ Incompatibilidad conocida: este fork está probado contra `dsh 0.2.0-rc.2`
aunque su `peerDependencies` declara `0.1.6-alpha.2`. El instalador de este repo
aplica la exención de versión oficial de dsh automáticamente. Efecto secundario
conocido y benigno: un warning `could not register the settings namespace
(settings.register is not a function)` en el log al arrancar — no afecta
mensajería, comandos, ni la entrevista de bienvenida.

## 2. `dsh-mnemosyne` — sin fork

[https://www.npmjs.com/package/dsh-mnemosyne](https://www.npmjs.com/package/dsh-mnemosyne)
se instala directo desde npm (versión fijada 0.6.0 en el instalador). Su configuración
multilingüe se documenta en el `AGENTS.md` que se despliega en el VPS: el agente
usa las herramientas `remember`/`recall` en el idioma del dueño, con banco
permanente `dueno` para los datos de la entrevista de bienvenida.

## Cómo actualizar estos forks

1. Mirá qué cambió upstream: `npm view @sympoies/dsh-telegram version`
2. Bajá el tarball nuevo, aplicá `MODIFICACIONES.diff` (o re-hacé los cambios
   puntuales de la tabla de arriba) y probá.
3. Reaplicá el selector de proyectos si el `lib/` nuevo no lo trae:
   `bash selector-proyecto/apply.sh` (idempotente, `--check` para ver si está).
4. Subí la versión del fork, actualizá `install.sh` si la exención cambia, y subí
   el número de versión de este repo (archivo `VERSION` + README).
