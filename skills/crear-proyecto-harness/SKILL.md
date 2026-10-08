---
name: crear-proyecto-harness
description: Crear y administrar proyectos (Workspaces) dentro del harness DSH — la carpeta de trabajo con nombre que aparece en la lista del panel y agrupa las sesiones de esa carpeta.
whenToUse: Cuando pidan "creá un proyecto nuevo", "agregá esta carpeta al harness", "quiero un proyecto para X" o haya que renombrar/sacar un proyecto de la lista del panel.
metadata:
  script: skills/crear-proyecto-harness/scripts/proyecto.py (el instalador lo copia a $DSH_HOME/skills/)
  endpoint_crear: workspace/create
  estado_durable: $DSH_HOME/storages/workspace.json
  token: DSH_WEB_TOKEN en ~/.dsh-env
  server: http://127.0.0.1:3080 (dsh-web.service)
---

# Crear un proyecto (Workspace) en el harness

## Lo primero: qué es un "proyecto" acá (esto es lo que costó tiempo)

En DSH un **proyecto NO es un perfil** y **no hay ningún comando `dsh proyecto`**.
Es un **Workspace** del paquete `@deepseek-ai/dsh-workspace`: un registro durable
de una carpeta de trabajo, con un nombre para mostrar, que:

- aparece en la **lista de proyectos del panel lateral** (menú de la izquierda),
- **agrupa las sesiones** que corren en esa carpeta (una sesión pertenece al
  proyecto de su cwd — el proyecto NO cambia el cwd de nada),
- se puede renombrar, reordenar y sacar de la lista **sin borrar la carpeta, los
  archivos ni las sesiones**.

Antes de esto, perder tiempo en: buscar un subcomando en `dsh --help`, crear un
**perfil** nuevo (`dsh --from-default-profile ...`) creyendo que es un proyecto,
o editar `workspace.json` a mano. Ninguna de las tres es la vía.

## La vía correcta (2 minutos con el script)

```bash
S="$DSH_HOME/skills/crear-proyecto-harness/scripts/proyecto.py"   # $DSH_HOME suele ser ~/.dsh

python3 $S listar                        # lista los proyectos (id, carpeta, nombre, sesiones)
mkdir -p ~/proyectos/mi-proyecto          # la carpeta tiene que existir ANTES
python3 $S crear ~/proyectos/mi-proyecto            # toma el nombre de la carpeta
python3 $S crear ~/proyectos/mi-proyecto "Otro nombre"
python3 $S renombrar <workspaceId> "Nombre nuevo"
python3 $S borrar <workspaceId>          # solo sale de la lista; no borra archivos
python3 $S rpc <endpoint> '{"request":{...}}'   # cualquier otro endpoint del controller
python3 $S endpoints                     # endpoints conocidos
```

Si la carpeta ya tenía proyecto, `crear` no duplica: avisa "ya existía" y
devuelve el mismo `workspaceId`.

## Si hay que hacerlo a mano (sin el script): el RPC local

El harness no expone un comando; la vía es el mismo RPC que usa la interfaz web.

1. **Login**: `GET http://127.0.0.1:3080/?token=<DSH_WEB_TOKEN>` (token en
   `~/.dsh-env`). Devuelve la cookie `dsh-auth-...`; hay que **reusarla**.
   Sin cookie, `/api` contesta `401 unauthorized`. Con un host que no es de
   confianza, `403 forbidden`. Ojo: la cookie está atada al host:puerto, así que
   hay que usar siempre la misma autoridad que el navegador (acá `127.0.0.1:3080`).
2. **Llamada**: `POST http://127.0.0.1:3080/api/workspace/create`, cabecera
   `Content-Type: application/json`, cuerpo:

```json
{"type":"client-request","rpcId":"<uuid>","method":"workspace/create",
 "payload":{"args":{"request":{"path":"~/proyectos/mi-proyecto"}}}}
```

Tres reglas del envelope que son la causa de todos los errores:

- `method` tiene que ser **exactamente igual** al endpoint de la URL
  (`workspace/create`), no el nombre pelado del método.
- `payload` lleva **un solo campo `args`**.
- adentro de `args`, el nombre del parámetro es el del descriptor: acá
  **`request`** (no `path` suelto), con el objeto adentro.

Respuesta buena:
`{"type":"server-response","rpcId":"...","result":{"ok":true,"value":{"workspace":{...},"created":true}}}`

## Errores y qué significan

| Respuesta / código | Causa |
|---|---|
| HTTP 401 `unauthorized` | falta la cookie (no se hizo el login con el token) |
| HTTP 403 `forbidden` | host no confiable: usar el mismo host:puerto de la UI |
| HTTP 404 `not found` | endpoint mal escrito (ver lista abajo) |
| `gateway/bad-request` "method X does not match endpoint Y" | `method` distinto del endpoint |
| `gateway/internal` "must contain exactly one plain-object args field" | falta el campo `args` |
| `gateway/arguments-invalid` "missing request / unexpected path" | nombres de `args` mal: va `request{...}` |
| `workspace/not-found` | `workspaceId` vacío o inexistente |

## Endpoints reales del controller (verificados 2026-10-07)

`workspace/create` (`request{path}`) · `workspace/rename`
(`request{workspaceId,title}`) · **`workspace/delete`** (`request{workspaceId}`)
· `workspace/insertBefore` (`request{workspaceId,beforeWorkspaceId?}`)
· `workspace/pinSession` · `workspace/unpinSession` · `workspace/archiveSession`
· `workspace/unarchiveSession` · `workspace/insertSessionBefore`
· `workspace/initializeDefault` · `workspace/follow` (stream) ·
`directoryPicker/list` · `directoryPicker/pick` · `directoryPicker/createDirectory`.

Cuidado: **`workspace/remove` y `workspace/setTitle` NO existen** (dan 404).
El nombre verdadero de la baja es `workspace/delete`.

Para descubrir los endpoints de **cualquier** controller:

```bash
grep -oE "id: '@deepseek-ai/dsh-[a-z-]+#[^']+'" \
  /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/<paquete>/lib/typert.remote-client.js | sort -u
```

El endpoint es la parte **después del `#`** (el gateway sólo acepta segmentos
`[A-Za-z0-9_$.-]`, por eso el id completo con `@` y `#` no va en la URL).
Los nombres de los argumentos salen del mismo archivo: buscá
`_<paquete>_<metodo>_parameter_0$schema` y el nombre del parámetro en el
descriptor (patrón `args` → `{request:{...}}` cuando el método recibe un objeto).

## Estado durable y verificación

- Se guarda en `$DSH_HOME/storages/workspace.json` (dominio `workspace` v2):
  `global.workspaceIds` = orden de la lista; `tables.workspaces` = un registro por
  id. **El registro no repite el id adentro: el id es la clave de la tabla.**
- **Nunca editar ese JSON a mano con el server corriendo**: la cache en memoria lo
  pisa en la próxima mutación (por ejemplo, cuando una sesión entra o sale de un
  proyecto). Se lee, sí; se escribe, sólo por RPC.
- Verificar: `python3 $S listar` (o leer el JSON, que es solo lectura).
- El panel se actualiza con su stream `workspace/follow`; puede necesitar un
  refresco de la página para verlo.

## Cambiar de proyecto sin escribir rutas (Telegram)

Desde Telegram hay un comando que ofrece la lista de proyectos como botones:
**`/cambiarproyecto`** (también `/proyecto` y `/proyectos`). Es un parche propio
al plugin de Telegram (`selector-proyecto/` de este repo); elegir un proyecto
hace lo mismo que `/cd` a esa carpeta. Detalle y cómo reaplicarlo:
[`selector-proyecto/README.md`](../selector-proyecto/README.md).

## Lo que NO hay que hacer

- **No** arrancar un segundo `dsh web` ni reiniciar `dsh-web.service` para que
  "tome" el cambio: el RPC escribe en caliente y el server ya lo sabe. Reiniciar
  corta la conversación en curso (y el bot de Telegram).
- **No** crear un perfil nuevo como si fuera un proyecto. Un perfil es un stack de
  plugins (`$DSH_HOME/profiles/<n>`), otra cosa. Si algún día se quiere "1 proyecto
  = 1 bot", eso sí es un perfil, pero es una decisión aparte.
- **No** usar `borrar` pensando que limpia el disco: la carpeta y las sesiones
  quedan intactas (a propósito). Para borrar archivos hay que hacerlo aparte.

## Tiempo esperado

Con el script: menos de un minuto (la carpeta tiene que existir). A mano, unos
minutos: lo único difícil es acertar el envelope y el nombre exacto del endpoint.
