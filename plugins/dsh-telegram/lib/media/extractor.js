/**
 * Reading an image with one model so another can use what it says.
 *
 * A provider inspects the whole request history for images, so an image left
 * in a conversation binds that conversation to a model that can see — for
 * good. That costs more than the picture is usually worth: the conversation
 * loses the model it was chosen for, and the tools configured around it.
 *
 * So the image never enters the conversation. It goes to a throwaway session
 * on the vision model, whose reply — the transcription, the description — is
 * what the conversation receives, as ordinary text. The conversation's history
 * stays free of images, so it keeps its own model and never becomes stuck.
 *
 * The throwaway session is disposed either way. It exists for one turn.
 */
import { SILENT_LOGGER } from '../harness/types.js';
import { labelOcr } from './ocr.js';
/** What the vision model is asked to do with the picture. */
const INSTRUCTION = 'Read this image for someone who cannot see it. Transcribe every piece of ' +
    'text it contains, exactly, including numbers, dates, names and amounts. ' +
    'Then describe briefly what the image is. Reply with only that — no ' +
    'preamble, no offer of further help.';
/** How long one extraction may take before the conversation moves on without it. */
const DEFAULT_TIMEOUT_MS = 120_000;
export class VisionExtractor {
    options;
    pending = new Map();
    logger;
    counter = 0;
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /**
     * Whether an image can be read at all right now.
     *
     * Optimistic about the fallback: probing Tesseract spawns a process, and
     * this is consulted on the path of every message. A fallback that turns out
     * to be absent simply reads nothing, which is the same outcome as saying so
     * here would have been.
     */
    get available() {
        return this.options.visionModel() !== undefined || this.options.fallback !== undefined;
    }
    /**
     * Replace image parts with what a vision model reads in them.
     *
     * @param content - the prompt as the user sent it.
     * @returns the same prompt with each image replaced by its reading, or the
     *   original content when there is nothing to read or no model to read it.
     */
    async resolve(content, route = this.options.visionModel()) {
        const images = content.filter((part) => part.type === 'image');
        if (images.length === 0)
            return [...content];
        // A route is no longer required: without one there is still OCR, and
        // without either the prompt says so rather than carrying an image that
        // nothing downstream can use.
        if (route === undefined && this.options.fallback === undefined)
            return [...content];
        const said = content
            .filter((part) => part.type === 'text')
            .map((part) => part.text);
        const read = route === undefined ? undefined : await this.read(images, route);
        if (read !== undefined) {
            // The user's own words first: the image is what they are asking about.
            return [
                ...said.map((text) => ({ type: 'text', text })),
                { type: 'text', text: `Contents of the image the user sent:\n\n${read}` },
            ];
        }
        // Reached either because nothing was configured to look, or because what
        // was configured could not be reached. Both are cases where reading the
        // text beats returning nothing at all.
        const scanned = await this.scan(images);
        if (scanned !== undefined) {
            return [...said.map((text) => ({ type: 'text', text })), { type: 'text', text: scanned }];
        }
        return [
            ...said.map((text) => ({ type: 'text', text })),
            {
                type: 'text',
                text: route === undefined
                    ? '(El usuario mandó una imagen, pero acá nada puede leerla. Configurá un modelo de visión en Ajustes → Telegram, o instalá tesseract.)'
                    : `(The user sent an image, but it could not be read by ${route.model}.)`,
            },
        ];
    }
    /**
     * Read every image's text with the fallback.
     *
     * The bytes come back from the attachment store rather than being kept
     * around: the model path never needs them, and holding every image in memory
     * against the chance that a model call fails would be a strange thing to pay
     * for on every message.
     *
     * @returns the readings joined, or undefined when there were none.
     */
    async scan(images) {
        const { fallback, attachments } = this.options;
        if (!fallback || !attachments)
            return undefined;
        if (!(await fallback.available()))
            return undefined;
        const readings = [];
        for (const image of images) {
            if (image.type !== 'image')
                continue;
            try {
                const stored = await attachments.readImage(image.attachment);
                const text = await fallback.read(stored.data);
                if (text !== undefined)
                    readings.push(text);
            }
            catch (error) {
                this.logger.warn('[dsh-telegram] could not read a stored image back', error);
            }
        }
        if (readings.length === 0)
            return undefined;
        return labelOcr(readings.length === 1
            ? readings[0]
            : readings.map((text, index) => `--- image ${index + 1} ---\n${text}`).join('\n\n'));
    }
    /**
     * Consume one session event.
     *
     * @returns whether it belonged to an extraction, so the caller knows not to
     *   treat it as a conversation of its own.
     */
    handle(sessionId, event) {
        const entry = this.pending.get(sessionId);
        if (!entry)
            return false;
        if (event.type === 'assistant/message') {
            const message = event.data?.message;
            const text = (message?.content ?? [])
                .filter((block) => block.type === 'text')
                .map((block) => block.text ?? '')
                .join('')
                .trim();
            if (text !== '')
                entry.text = text;
        }
        if (event.type === 'turn/end') {
            const reason = event.data?.reason;
            if (reason?.kind === 'error') {
                this.logger.warn(`[dsh-telegram] the vision model could not read the image: ${reason.error?.message ?? 'the turn failed'}`);
                entry.settle(undefined);
                return true;
            }
            entry.settle(entry.text === '' ? undefined : entry.text);
        }
        return true;
    }
    /** Abandon every extraction in flight — the plugin is unloading. */
    dispose() {
        for (const entry of [...this.pending.values()])
            entry.settle(undefined);
    }
    /** Run one throwaway turn and return what the model said. */
    async read(images, route) {
        const sessionId = this.nextSessionId();
        let agent;
        try {
            agent = await this.options.host.create(sessionId, this.options.cwd, route);
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not open a session to read the image', error);
            return undefined;
        }
        try {
            const settled = new Promise((resolve) => {
                const timer = setTimeout(() => {
                    this.pending.delete(sessionId);
                    this.logger.warn('[dsh-telegram] reading the image timed out');
                    resolve(undefined);
                }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
                this.pending.set(sessionId, {
                    text: '',
                    settle: (text) => {
                        clearTimeout(timer);
                        this.pending.delete(sessionId);
                        resolve(text);
                    },
                });
            });
            agent.followup([{ type: 'text', text: INSTRUCTION }, ...images]);
            return await settled;
        }
        finally {
            // One turn is its whole life; leaving it loaded would keep a second
            // model warm for every picture anyone sends.
            await agent.dispose().catch((error) => {
                this.logger.warn('[dsh-telegram] could not dispose the reading session', error);
            });
        }
    }
    /** A session id no conversation can collide with. */
    nextSessionId() {
        if (this.options.newSessionId)
            return this.options.newSessionId();
        this.counter += 1;
        return `tg-vision-${Date.now()}-${this.counter}`;
    }
}
//# sourceMappingURL=extractor.js.map