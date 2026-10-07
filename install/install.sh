#!/usr/bin/env bash
# ============================================================
# install.sh — Agente DSH installer (run on the VPS by your
# coding agent). Idempotent: safe to re-run.
#
# Usage:
#   BOT_TOKEN=123:abc DEEPSEEK_API_KEY=sk-... bash install.sh
#
# Optional:
#   DSH_VERSION=0.2.0-rc.2  (default, pinned to match the fork)
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_VERSION="${DSH_VERSION:-0.2.0-rc.2}"
WORKDIR="$HOME/agente-dsh"
DSH_HOME="$HOME/.dsh"

log()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ ${BOT_TOKEN:-} ]]    || fail "BOT_TOKEN not set. Ask the owner for the BotFather token."
[[ ${DEEPSEEK_API_KEY:-} ]] || fail "DEEPSEEK_API_KEY not set. Ask the owner for their DeepSeek key."

log "1/8 Node 24 (DSH plugins require >=24)"
if ! command -v node >/dev/null || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 24 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource.sh
  bash /tmp/nodesource.sh >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null
fi
node -v
# NOTE: never replace an existing /usr/local/bin/node symlink that other
# services depend on — see docs/TROUBLESHOOTING.md "the node trap".

log "2/8 pnpm (plugin manager dependency)"
command -v pnpm >/dev/null || npm install -g pnpm >/dev/null

log "3/8 DeepSeek Harness (dsh) ${DSH_VERSION}"
npm install -g "@deepseek-ai/dsh@${DSH_VERSION}" >/dev/null

log "4/8 Telegram plugin (fork from this repo)"
mkdir -p "$DSH_HOME/profiles/web"
dsh plugin --profile web allow-version @sympoies/dsh-telegram@0.7.0 \
  --dsh-version "$DSH_VERSION" --accept-risk 2>/dev/null || true
dsh plugin --profile web add -w "$REPO_DIR/plugins/dsh-telegram"

log "5/8 Mnemosyne (long-term memory)"
dsh plugin --profile web add -w dsh-mnemosyne@0.6.0 2>/dev/null \
  || dsh plugin --profile web add -w dsh-mnemosyne@0.6.0 --accept-risk

log "6/8 Secrets (chmod 600, never printed)"
umask 077
printf 'DEEPSEEK_API_KEY=%s\n' "$DEEPSEEK_API_KEY" > "$HOME/.dsh-env"
printf 'TELEGRAM_BOT_TOKEN=%s\n' "$BOT_TOKEN"     > "$HOME/.dsh-telegram.env"
grep -q '^DEEPSEEK_API_KEY=' /etc/environment 2>/dev/null || \
  cat "$HOME/.dsh-env" >> /etc/environment

log "7/8 Agent working directory + instructions"
mkdir -p "$WORKDIR"
cp "$REPO_DIR/AGENTS.md" "$WORKDIR/AGENTS.md"

log "8/8 systemd service (dsh-web, enabled at boot)"
DSH_BIN="$(command -v dsh)" || fail "dsh binary not found after install"
sed -e "s|__HOME__|$HOME|g" -e "s|__DSH_BIN__|$DSH_BIN|g" \
  "$REPO_DIR/install/dsh-web.service" > /etc/systemd/system/dsh-web.service
systemctl daemon-reload
systemctl enable --now dsh-web
sleep 5
systemctl is-active dsh-web || { journalctl -u dsh-web -n 20 --no-pager; fail "dsh-web did not start"; }

log "Registering Spanish command menu on Telegram"
curl -s --max-time 10 \
  -F "commands=<$REPO_DIR/install/bot-commands.json" \
  "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" | grep -q '"ok":true' \
  && echo "command menu registered" || echo "WARN: could not register commands (bot still works)"

log "DONE. Tell the owner:"
echo "  1. Open ~/.dsh/dsh-telegram/claim-code.txt and send the /claim message to the bot."
echo "  2. After claiming, send 'hola' to the bot: it will run the welcome interview."
echo "  Claim code (do not share): $(cat "$DSH_HOME/dsh-telegram/claim-code.txt" 2>/dev/null | grep -oE '/claim [a-z0-9]+' || echo 'see claim-code.txt')"
