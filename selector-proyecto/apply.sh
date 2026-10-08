#!/usr/bin/env bash
# Agrega el comando /cambiarproyecto al bot de Telegram: ofrece la lista de
# proyectos del harness (Workspaces) como botones y cambia a la carpeta elegida.
#
# QUÉ HACE (4 cambios, todos aditivos)
#   1. instala lib/session/projects.js (el selector, calcado del de /sessions);
#   2. index.js: lo construye y se lo pasa al router como `projects`;
#   3. router.js: atiende los comandos /cambiarproyecto, /proyecto y /proyectos,
#      y enruta los botones (`p:<token>:<index>`) al selector;
#   4. commands.js: agrega el comando al menú y a /help.
#
#   Elegir un proyecto hace lo mismo que /cd con esa carpeta: la guarda para el
#   chat y abre una conversación nueva (el cwd de una sesión se fija al abrir).
#
# CUÁNDO CORRERLO
#   El fork de este repo (plugins/dsh-telegram/) ya viene con el selector
#   aplicado. Corré esto después de una reinstalación o actualización del plugin,
#   que pisa el lib/ compilado y se lleva el comando. Es idempotente.
#
# USO
#   bash selector-proyecto/apply.sh
#   bash selector-proyecto/apply.sh --rollback
#   bash selector-proyecto/apply.sh --check
set -euo pipefail

LIB="${DSH_TELEGRAM_LIB:-${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/@sympoies/dsh-telegram/lib}"
SRC="$(cd "$(dirname "$0")" && pwd)/projects.js"

[ -d "$LIB" ] || { echo "ERROR: no existe $LIB" >&2; exit 1; }
[ -f "$SRC" ] || { echo "ERROR: no encuentro $SRC" >&2; exit 1; }

case "${1:-}" in
  --rollback)
    python3 - "$LIB" --rollback <<'PY'
import sys
from pathlib import Path
LIB = Path(sys.argv[1])
restored = 0
for orig in LIB.rglob('*.orig-proyecto'):
    target = Path(str(orig).replace('.orig-proyecto', ''))
    target.write_bytes(orig.read_bytes())
    print("restaurado:", target.relative_to(LIB))
    restored += 1
added = LIB / 'session' / 'projects.js'
if added.exists():
    added.unlink()
    print("borrado:", added.relative_to(LIB))
if restored == 0:
    print("no había nada que restaurar (¿nunca se aplicó?)")
PY
    exit 0
    ;;
  --check)
    python3 - "$LIB" --check <<'PY'
import sys
from pathlib import Path
LIB = Path(sys.argv[1])
files = ['index.js', 'router.js', 'commands.js']
missing = [f for f in files if 'ProjectPicker' not in (LIB / f).read_text(encoding='utf-8') and 'cambiarproyecto' not in (LIB / f).read_text(encoding='utf-8')]
ok = (LIB / 'session' / 'projects.js').exists() and not missing
print("APLICADO" if ok else "NO APLICADO" + ("" if ok else " (falta en %s)" % ", ".join(missing)))
sys.exit(0 if ok else 1)
PY
    exit 0
    ;;
esac

python3 - "$LIB" "$SRC" <<'PY'
import shutil
import sys
from pathlib import Path

LIB = Path(sys.argv[1])
SRC = Path(sys.argv[2])


def backup(path: Path) -> None:
    """Guarda el estado previo UNA vez, para poder volver exactamente a él."""
    safe = path.with_name(path.name + '.orig-proyecto')
    if not safe.exists():
        shutil.copy2(path, safe)
        print("  respaldo:", safe.name)


def patch(path: Path, anchor: str, addition: str, marker: str, where: str) -> bool:
    text = path.read_text(encoding='utf-8')
    if marker in text:
        print("  ya estaba:", path.name, "-", where)
        return False
    if anchor not in text:
        raise SystemExit("ERROR: no encuentro el ancla en %s (%s).\n"
                         "El plugin cambió de versión: revisar el parche." % (path.name, where))
    backup(path)
    path.write_text(text.replace(anchor, anchor + addition, 1), encoding='utf-8')
    print("  parcheado:", path.name, "-", where)
    return True


# 1) el módulo
dest = LIB / 'session' / 'projects.js'
if dest.exists() and dest.read_bytes() == SRC.read_bytes():
    print("projects.js: ya estaba igual")
else:
    if dest.exists():
        backup(dest)
    shutil.copy2(SRC, dest)
    print("projects.js: instalado")

index_js = LIB / 'index.js'
router_js = LIB / 'router.js'
commands_js = LIB / 'commands.js'

# 2) index.js: import
patch(index_js,
      "import { SessionPicker } from './session/picker.js';",
      "\nimport { ProjectPicker } from './session/projects.js';",
      "ProjectPicker", "import")

# 2b) index.js: construcción
patch(index_js,
      "    const sessionPicker = new SessionPicker({\n"
      "        surface,\n"
      "        pending,\n"
      "        history,\n"
      "        currentSession: (target) => bindings.forChat(target)?.sessionId,\n"
      "        adopt: (target, sessionId) => runner.adopt(target, sessionId),\n"
      "        logger,\n"
      "    });\n",
      "\n"
      "    const projectPicker = new ProjectPicker({\n"
      "        surface,\n"
      "        pending,\n"
      "        logger,\n"
      "        home,\n"
      "        current: cwdFor,\n"
      "        inspect: inspectDirectory,\n"
      "        set: (target, directory) => workspaces.set(target, directory),\n"
      "        reset: (target) => runner.reset(target),\n"
      "        registry: () => ctx.get('workspaceRegistry'),\n"
      "    });\n",
      "new ProjectPicker", "construcción")

# 2c) index.js: opción del router
patch(index_js,
      "        sessions: sessionPicker,\n",
      "        projects: projectPicker,\n",
      "projects: projectPicker", "opción del router")

# 3) router.js: los comandos
patch(router_js,
      "            case 'cd':\n"
      "                return await this.onChangeDirectory(target, args);\n",
      "            case 'proyecto':\n"
      "            case 'proyectos':\n"
      "            case 'cambiarproyecto':\n"
      "                if (this.options.projects === undefined) {\n"
      "                    return await this.say(target, 'Esta instalación no tiene la lista de proyectos.');\n"
      "                }\n"
      "                // Sin await, igual que /sessions: el poller tiene que seguir\n"
      "                // recibiendo para poder entregar el botón que resuelve esto.\n"
      "                void this.options.projects.offer(target).catch((error) => {\n"
      "                    this.logger.error('[dsh-telegram] project picker failed', error);\n"
      "                });\n"
      "                return;\n",
      "case 'cambiarproyecto':", "comandos")

# 3b) router.js: los botones
patch(router_js,
      "            (this.options.sessions?.handleCallback(query.data) ?? false)",
      " ||\n"
      "            (this.options.projects?.handleCallback(query.data) ?? false)",
      "this.options.projects?.handleCallback", "botones")

# 4) commands.js: menú y /help
patch(commands_js,
      "    cd: 'Ver o cambiar la carpeta de trabajo: /cd ~/proyectos/app',\n",
      "    cambiarproyecto: 'Cambiar de proyecto eligiendo de la lista',\n",
      "cambiarproyecto:", "menú")
PY

echo
echo "Listo. Ahora hay que recargar el plugin (esto reinicia dsh-web):"
echo "  systemd-run --collect --unit=telegram-proyecto-reload \\"
echo "    /bin/bash selector-proyecto/reload-and-verify.sh"
echo
echo "El comando ya está en el menú del teléfono que publica install/install.sh"
echo "(install/bot-commands.json). Si querés republicarlo a mano, mirá"
echo "docs/TROUBLESHOOTING.md -> \"the command menu\"."
