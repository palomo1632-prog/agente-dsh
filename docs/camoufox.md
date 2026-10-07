# 🕵️ Camoufox — navegador antidetect (opcional)

[Camoufox](https://camoufox.com) es un Firefox modificado para que la
automatización de navegador no sea detectable como bot (huella digital
uniforme, anti-fingerprinting). Útil cuando el agente necesita investigar algo
y el sitio le pone muros anti-bot al navegador automatizado.

## Instalación (decile a tu agente)

```bash
pip install camoufox
python3 -m camoufox fetch        # descarga el binario (~150 MB)
```

Se usa desde Python (playwright API compatible). Ejemplo mínimo que el agente
puede adaptar:

```python
from camoufox.sync_api import Camoufox
with Camoufox(headless=True) as browser:
    page = browser.new_page()
    page.goto("https://el-sitio.com")
```

## Combinado con el proxy residencial

Si el sitio además bloquea la IP del VPS, Camoufox acepta proxy propio:

```python
Camoufox(headless=True, proxy={"server": "http://IP:PUERTO", "username": "u", "password": "p"})
```

Así el navegador investiga "desde tu casa" mientras el resto del server sigue
por su camino normal (ver [proxy-residencial.md](proxy-residencial.md)).

## Notas

- Es opcional; el agente funciona perfectamente sin esto.
- Úsalo con cabeza: automatizar tu propia investigación está bien, Saltarse
  términos de servicio a propósito para abuso, no.
- En un VPS de 2 GB, el navegador es lo más pesado que vas a correr — cerralo
  cuando termines.
