# Agente DSH 🤖

Tu propio agente de IA en Telegram, corriendo en **tu** VPS, con **tu** API key,
atendiéndote desde el celular. Sin depender de servicios de terceros.

Basado en [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness)
con el plugin de Telegram (fork con mejoras en español incluido en este repo).

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
