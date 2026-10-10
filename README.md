![Agente DSH vs Hermes](assets/duelo-agente-dsh-vs-hermes.png)

# Agente DSH 🤖

**Versión 1.3.0** (2026-10-10) — [novedades](#novedades)

¿Estás perdiendo el tiempo con **Hermes** u **OpenClaw** en tu VPS? Creo que esto te puede interesar.

**Agente DSH** es un agente estilo Hermes, pero con asteroides. 🚀

### En pocas palabras

> **DSH Harness** + **Camoufox** (navegador antidetect) + **Mnemosyne** (memoria mejorada) + **Proxy residencial** para salir con IP de tu casa (la doc explica cómo configurarlo) + **Plugin de Telegram**

---

## Ventajas sobre Hermes

- ✅ **¡No se olvida de nada importante!** (Dios mío, yo también sufrí con Hermes por este problema)
- 🪶 **Pesa 17 veces menos** y no crece sin control.
- ⚡ **73% más rápido** en responder.
- 📉 **Consume 67% menos de tokens** por tarea.
- 😌 **1 millón menos de problemas** para completar las tareas.

## ¿Para qué lo uso?

Para todo lo que se usa Hermes, desde ya: recordatorios, asistente personal, investigar cosas, responder emails, etc. Pero además, algo que **nunca pude hacer con Hermes**:

- 🌐 Tengo **47 proyectos web de clientes distintos**. De vez en cuando un cliente pide un cambio — por lo general a cualquier hora — y si es algo rápido, **se lo pido a mi agente por Telegram** (incluso le paso el mensaje tal cual me lo envió el cliente).
- 📊 **Vigilar cuándo se caen los anuncios** de Meta, TikTok, etc., y hacer un relevamiento para ver si hay diferencias grandes respecto a los promedios.
- 📰 **Un email diario con las noticias locales**, con todas mis preferencias (Hermes podía hacer esto, pero siempre tenía un problema).
- 💬 **Controlar los comentarios de 32 fan pages** de Facebook e Instagram: responde, oculta, elimina, o me avisa si hay uno importante sin responder (Hermes lo hacía hasta cierto punto; después alucinaba).
- 📅 **Publicador de contenido** para las fan pages e Instagram — más de 32 páginas de clientes.

…y varias cosas más. Espero que les sirva. 🙌

> 👇 ¿Lo querés en tu VPS? Seguí la **[Instalación en 3 pasos](#instalación-en-3-pasos)** de abajo — tu agente de código hace todo el trabajo.

## Qué obtenés

- Un bot de Telegram que responde desde tu VPS (siempre prendido, siempre tuyo)
- Ejecuta comandos, edita archivos y trabaja en tu servidor con tu permiso
- Las preguntas y aprobaciones del agente llegan como **botones en el chat**
- **Cambiás de proyecto desde el teléfono** con un botón (`/cambiarproyecto`), sin tipear rutas
- Un agente que sabe **crear y administrar sus propios proyectos** (skill incluida)
- **Tu perfil en un archivo que se carga siempre**: la encuesta inicial arma
  `~/.dsh/AGENTS.md` (ciudad, uso, cómo te gusta que te responda) y ese archivo entra
  en todas las sesiones y proyectos. Corto a la fuerza: máximo 25 líneas
- **Lo que tu máquina sabe hacer, siempre a mano**: el mismo archivo lista las
  capacidades activas (notas de voz, navegador antidetect, proxy residencial) para que
  el agente las use en cualquier proyecto, sin que se lo tengas que recordar
- Memoria de largo plazo (Mnemosyne) multilingüe
- Notas de voz: le hablás y te entiende (transcripción con ElevenLabs — opcional)

## Requisitos

| Necesitás | Para qué |
|---|---|
| Un VPS (2 GB RAM alcanzan; probado en Ubuntu 24.04) | donde vive el agente |
| Un agente de código en tu PC con acceso SSH a ese VPS | quien hace la instalación |
| Un bot de Telegram ([@BotFather](https://t.me/BotFather) → `/newbot`) | el token del bot |
| Una API key de [DeepSeek](https://platform.deepseek.com) *(sugerido)* | el cerebro del agente — **podés usar el proveedor que quieras** (ChatGPT, Claude, modelos locales…); adaptarlo es hiper sencillo y lo hace tu agente en pocas líneas ([docs/proveedores.md](docs/proveedores.md)) |

## Instalación en 3 pasos

1. **Cloná este repo en tu PC** (o descargalo como ZIP y descomprimilo).
2. **Le pedís esto a tu agente de código** (DeepSeek Harness, Claude Code, Codex, ZCode, el que uses):

   > Leé `INSTALL-PROMPT.md` de esta carpeta y seguí las instrucciones al pie de la
   > letra para instalar Agente DSH en mi VPS. Te voy pasando el token del bot y la
   > API key cuando las pidas.

3. **Respondé lo que te pida**: el token de BotFather y tu API key. En ~5 minutos
   te avisó que el bot está vivo: mandale `/start` a tu bot desde el celular,
   y a trabajar.

## Qué incluye

| Archivo/carpeta | Qué es |
|---|---|
| `INSTALL-PROMPT.md` | El prompt completo que le das a tu agente instalador |
| `install/` | Scripts que el agente ejecuta en tu VPS, incluida la plantilla del `AGENTS.md` global (`global-AGENTS.template.md`) |
| `AGENTS.md` | Las instrucciones permanentes del agente (incluye la encuesta de bienvenida) |
| `plugins/dsh-telegram/` | Fork del plugin de Telegram (comandos y respuestas en español + fixes + selector de proyectos) |
| `selector-proyecto/` | El selector de proyectos del bot (`/cambiarproyecto`): código, parche y cómo reaplicarlo |
| `skills/` | Skills del agente (hoy: `crear-proyecto-harness`); el instalador las copia a `~/.dsh/skills/` |
| `docs/TROUBLESHOOTING.md` | Los errores típicos y cómo salirlas (en inglés, para tu agente) |
| `docs/voz-elevenlabs.md` | Notas de voz: qué es y cómo activarlo (opcional) |
| `docs/proxy-residencial.md` | Salí a internet con una IP residencial (celular viejo, mini-PC) sin tocar tu VPS |
| `docs/camoufox.md` | Navegador antidetect opcional para investigación |
| `docs/proveedores.md` | ¿Usás ChatGPT/Claude en vez de DeepSeek? Leé esto |

## Novedades

### v1.3.0 — 2026-10-10

- 🧰 **El `AGENTS.md` global ahora dice qué tiene la máquina**: la sección
  `## Capacidades activas` la escribe un **detector** (`install/global-agents-refresh.mjs`),
  no una persona. Lista solo lo que está instalado y andando ahí: notas de voz
  (ElevenLabs o Whisper), Camoufox y proxy residencial.
- 🔁 **Se mantiene sola**: el instalador la corre en cada instalación y se vuelve a
  correr cuando instalás o sacás un extra. Si el proxy no está configurado **no
  aparece**, y aparece el día que lo configures.
- 🔐 **Sin credenciales en el archivo**: el proxy se lista como "configurado" y apunta
  a `~/.dsh-proxy.env`; la URL con usuario y contraseña nunca va al archivo que se
  carga siempre.
- 📏 El tope sigue en **25 líneas**: entran la entrevista (5) y hasta 4 capacidades.

### v1.2.0 — 2026-10-10

- 🧠 **La encuesta de bienvenida ahora sirve de verdad**: las respuestas se escriben
  en `~/.dsh/AGENTS.md`, el archivo que DSH carga en **todas** las sesiones y
  proyectos. Antes se guardaban como "memorias permanentes" con un scope que la
  herramienta **rechaza** (`permanent` no existe: son `session`, `workspace` o
  `global`), así que el perfil se quedaba en la sesión y el archivo global quedaba
  vacío.
- 📏 **Corto y obligatorio**: el archivo global tiene tope de **25 líneas** y las
  reglas se lo dicen al agente en tres lugares (plantilla, `AGENTS.md` del proyecto y
  las instrucciones de la encuesta) para que nadie lo haga crecer sin control.
- 🧾 **La encuesta se dispara por el archivo, no por memoria**: mientras el marcador
  `ENTREVISTA DE BIENVENIDA — PENDIENTE` siga en el archivo, la encuesta está
  pendiente. Así se puede verificar y repetir a mano.
- 🛠 **Instalador**: paso nuevo que siembra el archivo global desde la plantilla y
  **nunca lo pisa** si ya existe (tu perfil sobrevive reinstalaciones y updates).
- 📄 **Docs**: sección nueva en `docs/TROUBLESHOOTING.md` sobre el archivo global.

### v1.1.0 — 2026-10-08

- 🗂 **Cambiar de proyecto desde el teléfono**: el bot trae el comando
  `/cambiarproyecto` (también `/proyecto` y `/proyectos`), que muestra tus
  proyectos del panel como botones y cambia la carpeta de trabajo sin tipear
  rutas. Ya viene aplicado en el plugin de este repo: no hay que hacer nada.
  Si actualizás el plugin, se reaplica con `selector-proyecto/apply.sh`.
- 🧠 **Skill `crear-proyecto-harness` incluida**: el agente sabe crear, renombrar
  y sacar proyectos del harness por su cuenta. El instalador la deja lista en
  `~/.dsh/skills/`.
- 🛠 **Instalador**: paso nuevo que copia las skills del repo, y el menú del bot
  ahora incluye el comando nuevo.
- 📄 **Docs**: cómo funciona el selector (`selector-proyecto/README.md`) y cómo
  republicar el menú del teléfono (`docs/TROUBLESHOOTING.md`).

Esta es la primera versión numerada del repo: antes no llevaba número. El número
vive en el archivo [`VERSION`](VERSION) — subilo en cada cambio que afecte a
quien instala.

## Filosofía

- **Mínima configuración**: dos claves y listo. Todo lo demás es opcional.
- **Tus claves, tus datos**: nada de este setup manda información a terceros
  más allá de las APIs que vos configures.
- **El agente instala**: no vas a pelear con la terminal; tu agente de código
  lee las instrucciones y trabaja solo, pidiéndote lo que falte.

## Licencia

MIT — mirá [LICENSE](LICENSE). Los plugins forkeados mantienen su licencia y
crédito original (ver [plugins/MODIFICACIONES.md](plugins/MODIFICACIONES.md)).
