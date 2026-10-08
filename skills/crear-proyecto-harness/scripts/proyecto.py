#!/usr/bin/env python3
"""Crear y administrar PROYECTOS (Workspaces) del harness DSH desde la terminal.

Un "proyecto" del harness es un Workspace de @deepseek-ai/dsh-workspace: una
carpeta de trabajo con nombre, que aparece en la lista del panel y agrupa las
sesiones que corren en esa carpeta. NO es un perfil de dsh.

Habla con el MISMO RPC local que usa la interfaz web (aprende a autenticarse con
el token de ~/.dsh-env y manda el envelope que el gateway espera). No toca
a mano ~/.dsh/storages/workspace.json: eso rompe la cache en memoria.

Uso:
    proyecto.py listar                       # lee la lista durable (solo lectura)
    proyecto.py crear <ruta> [titulo]        # crea el proyecto (la ruta debe existir)
    proyecto.py renombrar <workspaceId> <titulo>
    proyecto.py borrar <workspaceId>         # saca el proyecto de la lista; NO borra archivos
    proyecto.py rpc <endpoint> '<json-de-args>'   # cualquier otro endpoint del controller
    proyecto.py endpoints                    # lista los endpoints conocidos del controller

Variables: DSH_BASE (def. http://127.0.0.1:3080), DSH_WEB_TOKEN o ~/.dsh-env.
"""
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("DSH_BASE", "http://127.0.0.1:3080").rstrip("/")
ENV_FILE = os.environ.get("DSH_ENV_FILE", os.path.expanduser("~/.dsh-env"))
WORKSPACE_JSON = os.path.join(os.environ.get("DSH_HOME") or os.path.expanduser("~/.dsh"), "storages", "workspace.json")

ENDPOINTS = {
    "crear": "workspace/create",          # args: request{path}
    "renombrar": "workspace/rename",      # args: request{workspaceId,title}
    "borrar": "workspace/delete",         # args: request{workspaceId}
    "mover": "workspace/insertBefore",    # args: request{workspaceId,beforeWorkspaceId?}
    "fijar-sesion": "workspace/pinSession",
    "soltar-sesion": "workspace/unpinSession",
    "archivar-sesion": "workspace/archiveSession",
    "desarchivar-sesion": "workspace/unarchiveSession",
    "insertar-sesion-antes": "workspace/insertSessionBefore",
    "proyecto-por-defecto": "workspace/initializeDefault",
    "seguir": "workspace/follow",         # stream (no usar desde acá)
}


def token():
    tok = os.environ.get("DSH_WEB_TOKEN")
    if tok:
        return tok.strip()
    try:
        txt = open(ENV_FILE, errors="ignore").read()
    except FileNotFoundError:
        sys.exit("no encuentro el token: falta DSH_WEB_TOKEN o %s" % ENV_FILE)
    m = re.search(r"^DSH_WEB_TOKEN=(.*)$", txt, re.M)
    if not m:
        sys.exit("no hay DSH_WEB_TOKEN en %s" % ENV_FILE)
    return m.group(1).strip().strip('"').strip("'")


class Cliente:
    def __init__(self):
        self.op = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def login(self):
        """GET /?token=... -> cookie dsh-auth. Sin esto el /api responde 401."""
        url = BASE + "/?token=" + urllib.parse.quote(token())
        try:
            with self.op.open(url, timeout=20) as r:
                return r.status
        except urllib.error.HTTPError as e:
            sys.exit("login HTTP %s: %s" % (e.code, e.read()[:200].decode(errors="ignore")))

    def rpc(self, endpoint, args):
        """Envelope del gateway: method == endpoint del path, payload = {args: {...}}."""
        body = json.dumps({"type": "client-request", "rpcId": str(uuid.uuid4()),
                           "method": endpoint, "payload": {"args": args}}).encode()
        req = urllib.request.Request(
            BASE + "/api/" + endpoint, data=body,
            headers={"Content-Type": "application/json"})
        try:
            with self.op.open(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode(errors="ignore")[:300]
            if e.code == 401:
                sys.exit("401: falta la cookie (¿el server está arriba? ¿token correcto?)")
            if e.code == 403:
                sys.exit("403: host no confiable; usar el mismo host:puerto de siempre")
            if e.code == 404:
                sys.exit("404: el endpoint '%s' no existe en este server" % endpoint)
            sys.exit("HTTP %s: %s" % (e.code, cuerpo))


def ok(resp):
    if not isinstance(resp, dict):
        return None
    r = resp.get("result") or {}
    if r.get("ok"):
        return r.get("value")
    err = r.get("error") or {}
    print("ERROR %s: %s %s" % (err.get("code"), err.get("message"),
                               json.dumps(err.get("details") or {})))
    return None


def listar():
    """La lista durable, en orden, leída del JSON (solo lectura: no muta nada)."""
    try:
        d = json.load(open(WORKSPACE_JSON, encoding="utf-8"))
    except Exception as e:
        sys.exit("no pude leer %s: %r" % (WORKSPACE_JSON, e))
    tabla = d.get("tables", {}).get("workspaces", {})
    if not d.get("global", {}).get("workspaceIds"):
        print("(no hay proyectos)")
    for wid in d.get("global", {}).get("workspaceIds", []):
        w = tabla.get(wid)
        if not w:
            print("- %s  (id sin registro!)" % wid)
            continue
        # ojo: el registro NO repite el id adentro; el id es la clave de la tabla.
        # salida con tabulaciones para poder parsear (los nombres llevan espacios):
        print("%s\t%s\t%s\t(%d sesiones)" % (wid, w.get("path", "?"),
                                             w.get("title", "?"), len(w.get("sessionIds", []))))


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    cmd = a[0]
    if cmd == "listar":
        listar()
        return
    if cmd == "endpoints":
        for k, v in ENDPOINTS.items():
            print("%-10s %s" % (k, v))
        return
    if cmd == "rpc":
        if len(a) < 3:
            sys.exit("uso: proyecto.py rpc <endpoint> '<json-args>'")
        c = Cliente(); c.login()
        print(json.dumps(ok(c.rpc(a[1], json.loads(a[2]))), indent=1, ensure_ascii=False))
        return
    if cmd == "crear":
        if len(a) < 2:
            sys.exit("uso: proyecto.py crear <ruta> [titulo]")
        ruta = os.path.abspath(a[1])
        if not os.path.isdir(ruta):
            sys.exit("esa carpeta no existe: %s (creala antes)" % ruta)
        c = Cliente(); c.login()
        v = ok(c.rpc(ENDPOINTS["crear"], {"request": {"path": ruta}}))
        if v:
            w = v["workspace"]
            print("%s: %s -> %s" % ("creado" if v.get("created") else "ya existía",
                                    w["title"], w["path"]))
            print("workspaceId:", w["workspaceId"])
            if len(a) > 2 and a[2] != w["title"]:
                v2 = ok(c.rpc(ENDPOINTS["renombrar"],
                              {"request": {"workspaceId": w["workspaceId"], "title": a[2]}}))
                if v2:
                    print("renombrado a:", v2["workspace"]["title"])
        return
    if cmd == "renombrar":
        if len(a) < 3:
            sys.exit("uso: proyecto.py renombrar <workspaceId> <titulo>")
        c = Cliente(); c.login()
        v = ok(c.rpc(ENDPOINTS["renombrar"],
                     {"request": {"workspaceId": a[1], "title": a[2]}}))
        if v:
            print("ahora se llama:", v["workspace"]["title"])
        return
    if cmd == "borrar":
        if len(a) < 2:
            sys.exit("uso: proyecto.py borrar <workspaceId>")
        c = Cliente(); c.login()
        v = ok(c.rpc(ENDPOINTS["borrar"], {"request": {"workspaceId": a[1]}}))
        if v is not None:
            print("proyecto sacado de la lista (la carpeta y las sesiones NO se tocan)")
        return
    sys.exit("comando desconocido: %s (probá sin argumentos para ver la ayuda)" % cmd)


if __name__ == "__main__":
    main()
