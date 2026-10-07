#!/usr/bin/env node
/**
 * Puente local ElevenLabs para @sympoies/dsh-telegram.
 *
 * El plugin espera un endpoint tipo OpenAI:
 *   POST <endpoint>   Authorization: Bearer <token>   Content-Type: audio/ogg
 *   body = bytes crudos de la nota de voz
 *   respuesta = { "text": "..." }
 *
 * ElevenLabs (Scribe) usa otra forma:
 *   POST https://api.elevenlabs.io/v1/speech-to-text
 *   header xi-api-key + multipart (file, model_id)
 *   respuesta = { "text": "...", ... }
 *
 * Este proceso escucha SOLO en 127.0.0.1, recibe el audio de Telegram, lo manda
 * a ElevenLabs y devuelve { "text": ... } con la forma que el plugin entiende.
 * La clave se lee de /root/.elevenlabs.env (no viaja por la red).
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.ELEVENLABS_STT_PORT ?? 8791);
const HOST = '127.0.0.1';
const KEY_FILE = process.env.ELEVENLABS_ENV_FILE ?? '/root/.elevenlabs.env';
const API = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL_ID = process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v1';
const MAX_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 110_000;

function readKey() {
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
    try {
        const text = readFileSync(KEY_FILE, 'utf8');
        for (const line of text.split('\n')) {
            const match = /^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
            if (match) return match[1].replace(/^["']|["']$/g, '');
        }
    }
    catch {
        // El error se reporta abajo, al usarla.
    }
    return undefined;
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}

function log(...parts) {
    process.stdout.write(`${new Date().toISOString()} ${parts.join(' ')}\n`);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BYTES) {
                reject(new Error('too-large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function transcribe(bytes) {
    const key = readKey();
    if (!key) throw new Error('missing-key');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/ogg' }), 'nota.ogg');
    form.append('model_id', MODEL_ID);
    const started = Date.now();
    const response = await fetch(API, {
        method: 'POST',
        headers: { 'xi-api-key': key },
        body: form,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
        log(`elevenlabs HTTP ${response.status} en ${Date.now() - started} ms`);
        throw new Error(`upstream-${response.status}`);
    }
    let payload;
    try {
        payload = JSON.parse(text);
    }
    catch {
        throw new Error('bad-upstream-json');
    }
    const transcript = typeof payload?.text === 'string' ? payload.text.trim() : '';
    log(`transcript ${bytes.length} B -> ${transcript.length} caracteres en ${Date.now() - started} ms`);
    return transcript;
}

const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        sendJson(res, 200, { ok: true, model: MODEL_ID, key: readKey() ? 'ok' : 'missing' });
        return;
    }
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' });
        return;
    }
    readBody(req)
        .then(async (bytes) => {
            if (bytes.length === 0) {
                sendJson(res, 400, { error: 'empty body' });
                return;
            }
            try {
                const text = await transcribe(bytes);
                if (!text) {
                    sendJson(res, 422, { error: 'no se reconoció voz' });
                    return;
                }
                sendJson(res, 200, { text });
            }
            catch (error) {
                const detail = String(error?.message ?? error);
                log(`error: ${detail}`);
                if (detail === 'missing-key') {
                    sendJson(res, 500, { error: 'falta ELEVENLABS_API_KEY' });
                    return;
                }
                if (detail === 'upstream-429') {
                    sendJson(res, 429, { error: 'elevenlabs ocupado' });
                    return;
                }
                sendJson(res, 502, { error: 'falló la transcripción' });
            }
        })
        .catch((error) => {
            const tooLarge = String(error?.message) === 'too-large';
            sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'audio demasiado grande' : 'bad request' });
        });
});

server.listen(PORT, HOST, () => {
    log(`puente ElevenLabs escuchando en http://${HOST}:${PORT} (modelo ${MODEL_ID})`);
});
