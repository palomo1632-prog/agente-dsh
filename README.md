![Agente DSH vs Hermes](assets/duelo-agente-dsh-vs-hermes.png)

# Agente DSH 🤖

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
| `install/` | Scripts que el agente ejecuta en tu VPS |
| `plugins/dsh-telegram/` | Fork del plugin de Telegram (comandos y respuestas en español + fixes) |
| `docs/TROUBLESHOOTING.md` | Los errores típicos y cómo salirlas (en inglés, para tu agente) |
| `docs/voz-elevenlabs.md` | Notas de voz: qué es y cómo activarlo (opcional) |
| `docs/proxy-residencial.md` | Salí a internet con una IP residencial (celular viejo, mini-PC) sin tocar tu VPS |
| `docs/camoufox.md` | Navegador antidetect opcional para investigación |
| `docs/proveedores.md` | ¿Usás ChatGPT/Claude en vez de DeepSeek? Leé esto |

## Filosofía

- **Mínima configuración**: dos claves y listo. Todo lo demás es opcional.
- **Tus claves, tus datos**: nada de este setup manda información a terceros
  más allá de las APIs que vos configures.
- **El agente instala**: no vas a pelear con la terminal; tu agente de código
  lee las instrucciones y trabaja solo, pidiéndote lo que falte.

## Licencia

MIT — mirá [LICENSE](LICENSE). Los plugins forkeados mantienen su licencia y
crédito original (ver [plugins/MODIFICACIONES.md](plugins/MODIFICACIONES.md)).
