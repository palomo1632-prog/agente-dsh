#!/usr/bin/env bash
# Recarga dsh-web para que tome el comando /cambiarproyecto, verifica salud y
# hace rollback del parche si el plugin no levanta.
#
# Corre DESACOPLADO (systemd-run) y espera un momento sin actividad: reiniciar
# dsh-web mata la sesión del agente que lo pidió, así que no puede cortar una
# respuesta en curso.
#
# USO
#   systemd-run --collect --unit=telegram-proyecto-reload \
#     /bin/bash selector-proyecto/reload-and-verify.sh
set -uo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SERVICE="${DSH_SERVICE:-dsh-web}"
LIB="${DSH_TELEGRAM_LIB:-$DSH_HOME/profiles/web/node_modules/@sympoies/dsh-telegram/lib}"
STATUS="$DSH_HOME/dsh-telegram/status.json"
SESSIONS="$DSH_HOME/sessions"
LOG="${DSH_RELOAD_LOG:-${TMPDIR:-/tmp}/dsh-reload-proyecto.log}"
QUIET=60
MAX_WAIT=900

log() { echo "[$(date -Is)] $*" | tee -a "$LOG"; }

healthy() {
  systemctl is-active --quiet "$SERVICE" || { log "servicio NO activo"; return 1; }
  [ -f "$STATUS" ] || { log "status.json no existe"; return 1; }
  local age
  age=$(( $(date +%s) - $(stat -c %Y "$STATUS") ))
  log "status.json tiene ${age}s de antigüedad"
  [ "$age" -lt 120 ] || { log "el bot no reconectó (status.json viejo)"; return 1; }
  return 0
}

rollback() {
  log "ROLLBACK: saco el parche de /cambiarproyecto y reinicio"
  while IFS= read -r orig; do
    cp -p "$orig" "${orig%.orig-proyecto}"
    log "  restaurado ${orig#"$LIB"/}"
  done < <(find "$LIB" -name '*.orig-proyecto' 2>/dev/null)
  [ -f "$LIB/session/projects.js" ] && rm -f "$LIB/session/projects.js" && log "  borrado session/projects.js"
  systemctl restart "$SERVICE"
  sleep 25
  systemctl is-active --quiet "$SERVICE" && log "rollback OK: servicio activo" \
                                       || log "ALERTA: el servicio sigue caído tras el rollback"
}

log "=== recarga para /cambiarproyecto pedida ==="

waited=0
while :; do
  active=$(find "$SESSIONS" -name 'session.v4.jsonl.zstd' -newermt "-${QUIET} seconds" 2>/dev/null | wc -l)
  [ "$active" -eq 0 ] && break
  if [ "$waited" -ge "$MAX_WAIT" ]; then
    log "AVISO: ${MAX_WAIT}s de actividad continua; reinicio igual"
    break
  fi
  [ $((waited % 60)) -eq 0 ] && log "hay ${active} sesión(es) activa(s); espero (${waited}s)"
  sleep 15
  waited=$((waited + 15))
done

log "momento tranquilo (esperé ${waited}s). Reiniciando dsh-web..."
systemctl restart "$SERVICE"
sleep 30

if healthy; then
  log "OK: dsh-web activo y el bot reconectó. /cambiarproyecto debería estar."
else
  log "la verificación falló"
  rollback
fi
