/** Telegram voice notes become text before entering a DSH conversation. */
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_CHARS = 3500;
/** Credentials and recordings may use cleartext only on the local host. */
export function isSafeSpeechEndpoint(value) {
    try {
        const url = new URL(value);
        if (url.username || url.password || url.hash)
            return false;
        if (url.protocol === 'https:')
            return true;
        return url.protocol === 'http:' &&
            (url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === 'localhost');
    }
    catch {
        return false;
    }
}
export class TelegramVoiceTranscriber {
    options;
    constructor(options) {
        this.options = options;
    }
    async transcribe(voice) {
        if (!isSafeSpeechEndpoint(this.options.endpoint)) {
            return { kind: 'failure', notice: 'El reconocimiento de voz no está configurado.' };
        }
        if (voice.duration !== undefined && voice.duration > this.options.maxSeconds) {
            return { kind: 'failure', notice: 'Esa nota de voz es demasiado larga para transcribir.' };
        }
        if (voice.file_size !== undefined && voice.file_size > this.options.maxBytes) {
            return { kind: 'failure', notice: 'Esa nota de voz es demasiado grande para transcribir.' };
        }
        try {
            const file = await this.options.source.getFile(voice.file_id);
            if (!file.file_path)
                return { kind: 'failure', notice: 'Telegram no entregó el archivo de voz.' };
            if (file.file_size !== undefined && file.file_size > this.options.maxBytes) {
                return { kind: 'failure', notice: 'Esa nota de voz es demasiado grande para transcribir.' };
            }
            const bytes = await this.options.source.downloadFile(file.file_path, this.options.signal);
            if (bytes.length === 0 || bytes.length > this.options.maxBytes) {
                return { kind: 'failure', notice: 'Esa nota de voz está vacía o es demasiado grande para transcribir.' };
            }
            const deadline = AbortSignal.timeout(this.options.timeoutMs);
            const signal = this.options.signal
                ? AbortSignal.any([this.options.signal, deadline])
                : deadline;
            const response = await (this.options.fetchImpl ?? fetch)(this.options.endpoint, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${this.options.token}`,
                    'content-type': 'audio/ogg',
                },
                body: Buffer.from(bytes),
                signal,
                redirect: 'error',
            });
            if (response.status === 429) {
                return { kind: 'failure', notice: 'El reconocimiento de voz está ocupado. Probá de nuevo.' };
            }
            if (response.status === 413 || response.status === 422) {
                return { kind: 'failure', notice: 'No se pudo transcribir esa nota de voz.' };
            }
            if (!response.ok) {
                return { kind: 'failure', notice: 'El reconocimiento de voz no está disponible. Probá de nuevo.' };
            }
            const declaredLength = Number(response.headers.get('content-length'));
            if (declaredLength > MAX_RESPONSE_BYTES) {
                return { kind: 'failure', notice: 'El reconocimiento de voz devolvió demasiado texto.' };
            }
            const reader = response.body?.getReader();
            if (!reader)
                return { kind: 'failure', notice: 'El reconocimiento de voz no devolvió texto.' };
            const chunks = [];
            let size = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.byteLength;
                if (size > MAX_RESPONSE_BYTES) {
                    await reader.cancel();
                    return { kind: 'failure', notice: 'El reconocimiento de voz devolvió demasiado texto.' };
                }
                chunks.push(value);
            }
            const payload = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
            const text = typeof payload === 'object' && payload !== null && 'text' in payload &&
                typeof payload.text === 'string'
                ? payload.text.trim()
                : '';
            if (text.length > MAX_TRANSCRIPT_CHARS) {
                return { kind: 'failure', notice: 'El reconocimiento de voz devolvió demasiado texto.' };
            }
            return text
                ? { kind: 'success', text }
                : { kind: 'failure', notice: 'No se reconoció voz. Probá de nuevo.' };
        }
        catch {
            // Fetch errors may include the URL or headers. Neither belongs in chat or logs.
            return { kind: 'failure', notice: 'El reconocimiento de voz no está disponible. Probá de nuevo.' };
        }
    }
}
//# sourceMappingURL=voice.js.map