# 🔌 Proveedores de modelo (¿no usás DeepSeek?)

Este template viene configurado para **DeepSeek API** porque es el camino más
simple y barato (DSH es el harness de DeepSeek — la integración es nativa).

Pero DSH es agnóstico del modelo: su capa de LLM es configurable y los
adaptadores son plugins. Si usás otra cosa, contale a tu agente instalador
cuál y dejale que lea esto:

## ChatGPT / Codex (suscripción)

Una suscripción de ChatGPT **no es una API key**. Dos caminos: usar la API de
OpenAI con su propia key (pay-per-use, lo simple), o un adaptador que hable con
el backend de Codex. DSH resuelve esto con plugins de modelo — buscá en el
directorio de plugins de DSH el adaptador correspondiente y seguí su README.

## Claude (suscripción)

Igual que arriba: o API key de Anthropic (pay-per-use), o adaptador específico.
Anthropic sí publica API oficial — la vía directa es configurar el proveedor
`anthropic` en DSH con tu key.

## Modelos locales (Ollama, llama.cpp)

DSH puede apuntar a endpoints compatibles con OpenAI servidos localmente.
Si el modelo corre en la misma VPS, la latencia es cero y no pagás API —
a cambio de calidad y RAM.

## La regla práctica

Tu agente instalador conoce tu caso mejor que cualquier doc: describí qué
suscripción/key tenés y dejá que configure el proveedor. Lo único que el
template exige es que *algún* proveedor quede configurado antes de arrancar el
bot — sin `DEEPSEEK_API_KEY` (u otro proveedor), el agente no piensa.
