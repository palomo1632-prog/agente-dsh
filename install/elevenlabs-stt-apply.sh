#!/usr/bin/env bash
# Reconecta el audio de Telegram a ElevenLabs después de una actualización del
# plugin, del harness o de un perfil regenerado.
#
# Qué hace (todo idempotente):
#   1. se asegura de que la clave esté en /root/.dsh-env (referencia que el
#      plugin resuelve como tokenRef=ELEVENLABS_API_KEY);
#   2. deja el parche del home (/root/.dsh/cordis.patch.yml) con la entrada
#      `telegram` -> media.speech apuntando al puente local;
#   3. instala/levanta elevenlabs-stt.service (puente 127.0.0.1:8791).
#
# OJO: el plugin solo lee media.speech al arrancar, así que después de correr
# esto hay que reiniciar dsh-web. Reiniciar mata el turno en curso: usar el
# reinicio diferido (el que espera a que no haya nadie escribiendo).
set -euo pipefail

BRIDGE_DIR=/root/scripts/elevenlabs-stt
BRIDGE_PORT=8791
KEY_FILE=/root/.elevenlabs.env
DSH_ENV=/root/.dsh-env
HOME_PATCH=/root/.dsh/cordis.patch.yml
UNIT=/etc/systemd/system/elevenlabs-stt.service

log() { printf '%s %s\n' "$(date -Is)" "$*"; }

[ -f "$BRIDGE_DIR/server.mjs" ] || { log "FALTA $BRIDGE_DIR/server.mjs"; exit 1; }
[ -f "$KEY_FILE" ] || { log "FALTA $KEY_FILE (la clave de ElevenLabs)"; exit 1; }

# --- 1. clave disponible para el proceso del harness -------------------------
KEY="$(sed -nE 's/^[[:space:]]*ELEVENLABS_API_KEY[[:space:]]*=[[:space:]]*(.+)$/\1/p' "$KEY_FILE" | head -1)"
[ -n "$KEY" ] || { log "no encontré ELEVENLABS_API_KEY en $KEY_FILE"; exit 1; }
if grep -q '^ELEVENLABS_API_KEY=' "$DSH_ENV"; then
    sed -i "s|^ELEVENLABS_API_KEY=.*|ELEVENLABS_API_KEY=${KEY}|" "$DSH_ENV"
    log "clave actualizada en $DSH_ENV"
else
    printf 'ELEVENLABS_API_KEY=%s\n' "$KEY" >> "$DSH_ENV"
    log "clave agregada a $DSH_ENV"
fi
chmod 600 "$DSH_ENV"

# --- 2. parche del home ------------------------------------------------------
if [ -f "$HOME_PATCH" ] && grep -q "127.0.0.1:${BRIDGE_PORT}" "$HOME_PATCH"; then
    log "el parche del home ya apunta al puente"
else
    cat > "$HOME_PATCH" <<EOF
# Capa de parches del home (\$DSH_HOME/cordis.patch.yml).
#
# Se aplica SOBRE el cordis.patch.yml de cada perfil, así que sirve para la
# configuración local de este server que no queremos perder si un perfil se
# regenera o si la UI reescribe el parche del perfil.
#
# telegram: las notas de voz se transcriben con ElevenLabs (Scribe) antes de
# entrar a la conversación. El plugin espera un endpoint tipo OpenAI
# (POST + Bearer + body crudo -> {"text": ...}); el puente local
# elevenlabs-stt.service (127.0.0.1:${BRIDGE_PORT}) traduce eso a la API real de
# ElevenLabs. Reaplicar con: bash ${BRIDGE_DIR}/apply.sh
- id: telegram
  config:
    media:
      speech:
        enabled: true
        endpoint: http://127.0.0.1:${BRIDGE_PORT}/v1/audio/transcriptions
        tokenRef: ELEVENLABS_API_KEY
        # Telegram manda notas largas; 45 s (el default del plugin) es poco.
        maxSeconds: 300
EOF
    log "parche del home reescrito con la entrada telegram"
fi

# --- 3. unidad del puente ----------------------------------------------------
if [ ! -f "$UNIT" ]; then
    cat > "$UNIT" <<'EOF'
# Puente local de transcripción: convierte el endpoint tipo OpenAI que espera
# @sympoies/dsh-telegram en la API real de ElevenLabs (Scribe).
# Escucha SOLO en 127.0.0.1:8791; la clave vive en /root/.elevenlabs.env.
[Unit]
Description=Puente ElevenLabs speech-to-text para dsh-telegram
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=HOME=/root
Environment=ELEVENLABS_ENV_FILE=/root/.elevenlabs.env
ExecStart=/usr/bin/node /root/scripts/elevenlabs-stt/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
    log "unidad $UNIT creada"
fi
systemctl daemon-reload
systemctl enable elevenlabs-stt >/dev/null 2>&1 || true
systemctl restart elevenlabs-stt
sleep 2

if systemctl is-active --quiet elevenlabs-stt; then
    HEALTH="$(curl -s -m 10 "http://127.0.0.1:${BRIDGE_PORT}/health" || true)"
    log "puente activo: ${HEALTH:-sin respuesta al health}"
else
    log "ERROR: elevenlabs-stt no arrancó"
    systemctl status elevenlabs-stt --no-pager | tail -20
    exit 1
fi

log "listo. Reiniciar dsh-web (diferido) para que el plugin tome media.speech."
