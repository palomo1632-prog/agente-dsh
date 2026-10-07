# 🎙 Notas de voz con ElevenLabs (opcional)

Le mandás un audio por Telegram y el agente lo entiende. Requiere una API key de
[ElevenLabs](https://elevenlabs.io) (tienen plan gratuito con horas suficientes
para uso personal).

## Cómo funciona (sin magia oscura)

```
Vos 🎤 → Telegram → plugin de Telegram → puente local (127.0.0.1:8791) → ElevenLabs
```

El plugin de Telegram espera un endpoint de transcripción "estilo OpenAI". El
puente (`install/` en este repo: `server.mjs`) recibe eso y lo traduce a la API
real de ElevenLabs (Scribe). Tu key viaja siempre por variable de entorno —
nunca queda escrita en archivos de configuración legibles.

## Activación (decile a tu agente que haga esto)

1. Conseguí tu API key de ElevenLabs y dársela al agente.
2. El agente debe:
   - copiar `install/` (server.mjs) a `/root/scripts/elevenlabs-stt/` (o donde
     prefiera), crear el systemd service que corre `node server.mjs` en el
     puerto 8791, con `EnvironmentFile` apuntando a un archivo chmod-600 que
     contenga `ELEVENLABS_API_KEY=...`,
   - correr `bash install/elevenlabs-stt-apply.sh` — agrega al patch global de
     DSH la config `media.speech` (endpoint del puente + `tokenRef:
     ELEVENLABS_API_KEY` + `maxSeconds: 300`),
   - reiniciar `dsh-web` y mandarte un audio de prueba.

## Notas

- `maxSeconds: 300` permite notas largas (el default de 45 s se queda corto).
- Sin ElevenLabs: el bot funciona igual, simplemente ignora los audios.
- Alternativa 100% local y gratis: **Whisper** (ver abajo) — más lento en un
  VPS chico, pero sin dependencia de terceros. Le pedís a tu agente que
  instale `faster-whisper` y apunte el mismo campo `media.speech` a un puente
  equivalente.
