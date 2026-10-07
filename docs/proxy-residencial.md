# 🏠 Salir a internet con una IP residencial (opcional)

**El problema:** algunos sitios (Facebook, X, Cloudflare, Google) desconfían de
las IPs de datacenter como la de tu VPS y te ponen captchas o bloqueos.

**La solución elegante:** usar la IP de tu casa **solo para el programa que la
necesita**, sin tocar nada más del servidor.

## ❌ Lo que NO hacer: el exit node

Tailscale tiene "exit nodes": le decís al VPS *"todo tu internet salí por mi
casa"*. Es **todo o nada**: mientras esté prendido, tus sitios web, tus bots y
tus APIs salen por la conexión de tu hogar, y si esa conexión falla, todo el
servidor queda mudo. El primer usuario de este template perdió 86 minutos de
sitios caídos por eso. No lo uses en una máquina que sirve algo.

## ✅ Lo que sí hacer: un proxy por aplicación

Un **proxy HTTP** corriendo en un aparato de tu casa (conectado a tu Tailscale).
Solo los comandos que *eligen* usarlo salen por tu casa; el resto del sistema ni
se entera. Si el proxy muere, el resto del server sigue perfecto.

### ¿Con qué armo el proxy?

| Aparato | Cómo |
|---|---|
| **Celular Android viejo** (el clásico) | Termux + `pkg install tinyproxy` (o 3proxy), configurás usuario/contraseña |
| Mini-PC / notebook vieja | tinyproxy o dante, igual que arriba |
| Router con OpenWrt | tiene proxy en los paquetes |

El aparato necesita Tailscale instalado y prendido (es lo que le permite al VPS
alcanzarlo por la red interna, sin abrir puertos de tu casa).

### Cómo lo usa el agente

Decile una sola vez a tu Agente DSH:

> Cuando un sitio bloquee la IP del VPS y quieras investigarlo, usá el proxy
> HTTP `http://USUARIO:CONTRASEÑA@IP-TAILSCAN-DEL-APARATO:PUERTO`. Solo ese
> comando sale por mi casa (`curl -x '...'`, o el navegador con ese proxy
> configurado). Nunca cambies rutas del sistema ni uses exit nodes.

El agente lo guarda en su memoria y lo aplica siempre así:

```bash
curl -x 'http://usuario:clave@100.x.y.z:8888' https://sitio-bloqueado.com
```

Y verifica con `ifconfig.me` que la IP de salida sea la de tu casa antes de
confiar en el resultado.

### Regla de oro

Per-app proxy = sí. Routing global = jamás (salvo que sepas exactamente qué
hacés y aceptes que todo se cae si tu casa se queda sin internet).
