# INSTALL-PROMPT.md

> 🇪🇸 **Para el humano:** este archivo es el que tu agente de código lee para instalar todo.
> No tenés que leerlo vos — solo seguí el paso 2 del README. Todo abajo está en inglés
> porque lo va a interpretar una IA.

---

You are installing **Agente DSH** — a personal AI agent that lives on the owner's VPS
and talks to them via Telegram. Work step by step, verify each step, and ask the owner
only for the information you cannot find yourself.

## Inputs you need from the owner (ask one at a time)

1. **Telegram bot token** — from [@BotFather](https://t.me/BotFather) (`/newbot`).
2. **DeepSeek API key** — from <https://platform.deepseek.com>.
   (If the owner wants ChatGPT/Claude instead, read `docs/proveedores.md` first.)

## Installation steps

1. **Read `docs/TROUBLESHOOTING.md` now**, before touching anything. It contains
   the failure modes that cost real downtime to the first user. Do not repeat them.
2. **Run `bash install/install.sh`** on the VPS (as root or with sudo). It:
   - installs Node 24 if missing (NodeSource) and pnpm,
   - installs `@deepseek-ai/dsh` globally (pinned version),
   - installs the **forked Telegram plugin from this repo** (`plugins/dsh-telegram/`),
     applying the documented version exemption,
   - installs `dsh-mnemosyne` (memory),
   - creates `~/agente-dsh/` (the agent working directory, ships this repo's `AGENTS.md`
     as the agent's permanent instructions),
   - creates `~/.dsh-env` and `~/.dsh-telegram.env` (chmod 600) for the API key and
     the bot token — **never commit or print these values**,
   - registers the systemd service `dsh-web` (enabled at boot),
   - registers the Spanish bot command menu via the Telegram API.
   Pass the token and key to the script via environment variables:
   `BOT_TOKEN=... DEEPSEEK_API_KEY=... bash install/install.sh`
3. **Verify**: `systemctl is-active dsh-web`, then `curl` the Telegram `getMe`
   endpoint with the token. Check `journalctl -u dsh-web -n 30` for a
   `[dsh-telegram]` line saying the bot is connected.
4. **Claim the bot**: read `~/.dsh/dsh-telegram/claim-code.txt` and tell the owner to
   send that `/claim <code>` message to their bot from their phone. Wait for them to
   confirm it worked (the file disappears once claimed).
5. **Onboarding**: once claimed, tell the owner to send "hola" to the bot. The agent's
   `AGENTS.md` (already deployed) makes the bot run a one-question-at-a-time welcome
   interview and save the answers as permanent memory. Nothing for you to do here —
   just let the owner know it happens on the first message.
6. **Optional extras**: tell the owner these exist but are NOT required to finish:
   voice notes (ElevenLabs), local Whisper, web search (Tavily), antidetect browser
   (Camoufox), residential-IP proxy. Docs for each are in `docs/`. If the owner says
   "later", the installed agent will remember it — leave it alone.

## Rules

- Never print, log, or store the token or API keys anywhere except the chmod-600
  env files created in step 2.
- If any step fails, read `docs/TROUBLESHOOTING.md` before improvising.
- Do not install anything beyond what this document lists without asking the owner.
