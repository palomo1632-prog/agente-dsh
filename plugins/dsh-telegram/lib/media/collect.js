/**
 * Fetching a message's media and turning it into prompt content.
 *
 * Downloading is the part that can go wrong in ordinary ways — a file above
 * the bot download limit, a network drop, an image the harness refuses — and
 * none of them should cost the user their message. So every failure becomes a
 * note in the prompt saying what could not be read, and the text the user
 * typed alongside it still reaches the agent.
 */
import { SILENT_LOGGER } from '../harness/types.js';
import { describeMedia, isStorableImage } from './intake.js';
import { describeSize, isTooLarge, orderBySuitability } from './limits.js';
export class MediaCollector {
    options;
    logger;
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /**
     * Turn one message into the parts a prompt is built from.
     *
     * @param message - the incoming message.
     * @param caption - the text the user typed, if any.
     * @returns text and image parts, in the order the model should read them.
     */
    async collect(message, caption, context = {}) {
        const item = describeMedia(message);
        const said = caption?.trim();
        if (!item) {
            return { parts: said ? [{ type: 'text', text: said }] : [] };
        }
        if (item.kind === 'unsupported') {
            const what = item.describedAs ?? 'un archivo';
            return this.declined(said, `${what}, which cannot be read`, `I can't read ${what}.`);
        }
        if (item.size !== undefined && item.size > this.options.maxBytes) {
            const limit = Math.floor(this.options.maxBytes / 1024 / 1024);
            return this.declined(said, `a file of ${item.size} bytes, above the size limit`, `That file is too large — the limit is ${limit} MB.`);
        }
        if (item.kind === 'image') {
            // Skipped when anything can read the picture: the conversation's own
            // model, a vision model behind it, or OCR. The refusal exists to replace
            // a failed turn with a useful sentence, and with any of those in place it
            // would instead throw away an image that was going to be read.
            const readable = context.modelSees === true || (await this.options.canReadWithoutModel?.()) === true;
            const refusal = readable ? undefined : await this.imageRefusal();
            if (refusal)
                return this.declined(said, refusal.forAgent, refusal.forUser);
        }
        try {
            if (item.kind === 'text') {
                const bytes = await this.download(item.fileId);
                const text = decodeText(bytes, this.options.maxTextChars);
                const name = item.name ?? 'adjunto';
                return {
                    parts: [
                        { type: 'text', text: `${said ? `${said}\n\n` : ''}File \`${name}\`:\n\n${text}` },
                    ],
                };
            }
            if (!this.options.attachments) {
                return this.declined(said, 'una imagen, pero esta instalación no guarda imágenes', 'Esta instalación no guarda imágenes.');
            }
            if (!isStorableImage(item.mediaType)) {
                const type = item.mediaType ?? 'unknown';
                return this.declined(said, `una imagen de tipo ${type}, que no se puede guardar`, `Las imágenes de tipo ${type} no se pueden guardar. Sirven PNG, JPEG, WebP y GIF.`);
            }
            const stored = await this.storeImage(item);
            if (!stored) {
                // Reached only when every size Telegram offered was still refused,
                // which in practice means a file sent uncompressed: there is one size
                // and it is the full-resolution original.
                const limits = this.options.attachments.imageLimits;
                const explanation = describeSize(largest(item.candidates), limits) ??
                    'Esa imagen es más grande de lo que esta instalación guarda.';
                return this.declined(said, 'una imagen demasiado grande para guardar, así que quedó afuera', `${explanation} Mandala como foto (y no como archivo) para que Telegram ofrezca una copia más chica.`);
            }
            // Text first: it is what the user asked, and the image is its subject.
            const parts = [];
            if (said)
                parts.push({ type: 'text', text: said });
            parts.push({ type: 'image', attachment: stored });
            return { parts };
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not read an attachment', error);
            const reason = error instanceof Error ? error.message : String(error);
            return this.declined(said, `un archivo que no se pudo leer: ${reason}`, `No se pudo leer ese archivo: ${reason}`);
        }
    }
    /**
     * Turn a whole album into one prompt.
     *
     * Each part is collected on its own — the same path a single photo takes, so
     * refusals and size limits behave identically — and the results are then
     * laid out as one message would have been: what the user said, then every
     * image, then anything that could not be read.
     *
     * @param messages - the album's parts, in the order they were sent.
     * @param caption - the one caption the album carries.
     */
    async collectAll(messages, caption, context = {}) {
        if (messages.length === 0)
            return { parts: [] };
        if (messages.length === 1) {
            return await this.collect(messages[0], caption, context);
        }
        // Sequential rather than parallel: each part downloads bytes and commits
        // them, and a dozen at once is a burst of traffic and disk for no gain
        // when the user is waiting on the whole set anyway.
        const collected = [];
        for (const message of messages) {
            collected.push(await this.collect(message, undefined, context));
        }
        const said = caption?.trim();
        const images = collected.flatMap((item) => item.parts.filter((part) => part.type === 'image'));
        const notes = collected.flatMap((item) => item.parts.filter((part) => part.type === 'text'));
        const notices = collected.map((item) => item.notice).filter((notice) => notice !== undefined);
        const parts = [];
        if (said)
            parts.push({ type: 'text', text: said });
        parts.push(...images);
        // After the images, because a note explains what is missing from them.
        parts.push(...notes);
        return {
            parts,
            // One line however many parts failed the same way: three identical
            // refusals in a row say nothing the first did not.
            ...(notices.length > 0 ? { notice: [...new Set(notices)].join('\n') } : {}),
        };
    }
    /**
     * Store an image, stepping down through Telegram's smaller renderings.
     *
     * The seam refuses anything over its per-side limit, and the largest size of
     * a phone screenshot is always over it — 1179×2556 against a limit of 2000.
     * The largest size that fits is tried first, and a rejection falls through
     * to the next, because the limit belongs to the harness and may not be the
     * number read here.
     *
     * @returns the stored reference, or undefined when no size was accepted.
     */
    async storeImage(item) {
        const store = this.options.attachments;
        if (!store)
            return undefined;
        const candidates = item.candidates ?? [{ fileId: item.fileId }];
        const ordered = orderBySuitability(candidates, store.imageLimits);
        for (const candidate of ordered) {
            try {
                const bytes = await this.download(candidate.fileId);
                return await store.saveImage({
                    data: bytes,
                    mediaType: item.mediaType,
                    ...(item.name !== undefined ? { name: item.name } : {}),
                });
            }
            catch (error) {
                // Only a size refusal is worth another download; a malformed file or a
                // failed write would fail identically however small the image was.
                if (!isTooLarge(error))
                    throw error;
                this.logger.debug('[dsh-telegram] image refused as too large; trying a smaller size', error);
            }
        }
        // Exhausted rather than thrown: the seam's own wording — "Image exceeds
        // the configured per-side pixel limit" — tells the user nothing they can
        // act on, and the caller has something better to say.
        return undefined;
    }
    /**
     * Why an image must not be sent on the current route, if it must not.
     *
     * A model with no image input rejects the entire request, so this refusal
     * replaces a failed turn with a sentence naming what would have worked.
     */
    async imageRefusal() {
        const vision = this.options.vision;
        if (!vision)
            return undefined;
        if ((await vision.verdict()) !== 'no')
            return undefined;
        const model = vision.currentModel() ?? 'the current model';
        const alternatives = await vision.alternatives();
        const suggestion = alternatives.length > 0
            ? ` These accept images: ${alternatives.join(', ')}.`
            : ' No configured model accepts images.';
        return {
            forAgent: `an image, which the model ${model} cannot read, so it was left out`,
            forUser: `${model} can't read images.${suggestion} Change it in Settings → Models.`,
        };
    }
    /** Keep the caption, tell the agent what was left out, and tell the user why. */
    declined(said, forAgent, forUser) {
        // Applied here rather than at each call site: every refusal in this class
        // funnels through this method, so one guard covers all of them and a
        // refusal added later cannot forget it.
        const clean = this.options.redact ?? ((text) => text);
        return {
            parts: [{ type: 'text', text: clean(note(said, `The user sent ${forAgent}.`)) }],
            notice: clean(forUser),
        };
    }
    /** Resolve a file id and pull its bytes, refusing anything oversized. */
    async download(fileId) {
        const file = await this.options.source.getFile(fileId);
        if (!file.file_path)
            throw new Error('telegram returned no download path');
        if (file.file_size !== undefined && file.file_size > this.options.maxBytes) {
            throw new Error(`file is ${file.file_size} bytes, above the size limit`);
        }
        return await this.options.source.downloadFile(file.file_path);
    }
}
/** The biggest size offered, for a refusal that can name what was sent. */
function largest(candidates) {
    if (!candidates || candidates.length === 0)
        return undefined;
    return candidates.reduce((biggest, candidate) => (candidate.width ?? 0) * (candidate.height ?? 0) > (biggest.width ?? 0) * (biggest.height ?? 0)
        ? candidate
        : biggest);
}
/** Keep what the user said, and add why their file did not come through. */
function note(said, explanation) {
    return said ? `${said}\n\n(${explanation})` : `(${explanation})`;
}
/** Decode file bytes as text, replacing what is not valid UTF-8. */
function decodeText(bytes, maxChars) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n\n… (truncated at ${maxChars} characters)`;
}
//# sourceMappingURL=collect.js.map