/**
 * Fetching a message's media and turning it into prompt content.
 *
 * Downloading is the part that can go wrong in ordinary ways — a file above
 * the bot download limit, a network drop, an image the harness refuses — and
 * none of them should cost the user their message. So every failure becomes a
 * note in the prompt saying what could not be read, and the text the user
 * typed alongside it still reaches the agent.
 */
import type { TelegramMessage } from '../telegram/types.js';
import type { Logger } from '../harness/types.js';
import type { ImageLimits } from './limits.js';
import type { VisionCheck } from './vision.js';
/** A durable image reference, as the harness attachment seam returns it. */
export interface ImageRef {
    readonly attachmentId: unknown;
    readonly mediaType: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly name?: string;
}
/** One piece of a prompt. */
export type PromptPart = {
    readonly type: 'text';
    readonly text: string;
} | {
    readonly type: 'image';
    readonly attachment: ImageRef;
};
/** Downloading bytes from Telegram. */
export interface MediaSource {
    getFile(fileId: string): Promise<{
        file_path?: string;
        file_size?: number;
    }>;
    downloadFile(filePath: string, signal?: AbortSignal): Promise<Uint8Array>;
}
/** The harness attachment seam, narrowed to what this needs. */
export interface AttachmentStore {
    saveImage(input: {
        data: Uint8Array;
        mediaType: string;
        name?: string;
    }): Promise<ImageRef>;
    /**
     * The seam's own limits, where it publishes them.
     *
     * Read rather than configured a second time: the operator sets this on the
     * attachment plugin, and a copy on this side would silently drift out of
     * step with the number that actually decides.
     */
    readonly imageLimits?: ImageLimits;
}
/** What the caller knows about the turn these attachments are for. */
export interface CollectionContext {
    /**
     * Whether the model this turn will run on accepts images itself.
     *
     * Decided per conversation, because `/model` is per conversation: judging
     * the deployment default would refuse an image on a chat that had switched
     * to a model which can see.
     */
    readonly modelSees?: boolean;
}
/** What a message's attachments became, plus anything the user should be told. */
export interface CollectedMedia {
    /** Content for the agent, in the order the model should read it. */
    readonly parts: PromptPart[];
    /**
     * A line for the chat, when something the user sent could not be used. The
     * agent's prompt says so too, but the person who sent it should not have to
     * wait for a reply to learn their screenshot went nowhere.
     */
    readonly notice?: string;
}
/** Construction options. */
export interface MediaCollectorOptions {
    readonly source: MediaSource;
    /** Absent on a deployment with no attachment seam; images are then declined. */
    readonly attachments?: AttachmentStore;
    /**
     * Whether the model can read an image at all. Absent skips the check and
     * lets the provider be the authority, which is the older behaviour.
     */
    readonly vision?: VisionCheck;
    /**
     * Whether an image can be read even where no model accepts one — OCR.
     *
     * Consulted before refusing, because a refusal here happens before the
     * download and so takes the picture away from whatever could have read it.
     */
    readonly canReadWithoutModel?: () => Promise<boolean>;
    /** Refuse anything larger, before downloading it. */
    readonly maxBytes: number;
    /** Truncate an inlined text file to this many characters. */
    readonly maxTextChars: number;
    /**
     * Strip anything secret from a refusal before it is written down.
     *
     * A refusal quotes the failure that caused it, and lands in two durable
     * places at once: the chat, and the session log the agent carries forward.
     * The API client already redacts its own errors, so this is the second lock
     * rather than the first — but this sink is the one that persists.
     */
    readonly redact?: (text: string) => string;
    readonly logger?: Logger;
}
export declare class MediaCollector {
    private readonly options;
    private readonly logger;
    constructor(options: MediaCollectorOptions);
    /**
     * Turn one message into the parts a prompt is built from.
     *
     * @param message - the incoming message.
     * @param caption - the text the user typed, if any.
     * @returns text and image parts, in the order the model should read them.
     */
    collect(message: TelegramMessage, caption: string | undefined, context?: CollectionContext): Promise<CollectedMedia>;
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
    collectAll(messages: readonly TelegramMessage[], caption: string | undefined, context?: CollectionContext): Promise<CollectedMedia>;
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
    private storeImage;
    /**
     * Why an image must not be sent on the current route, if it must not.
     *
     * A model with no image input rejects the entire request, so this refusal
     * replaces a failed turn with a sentence naming what would have worked.
     */
    private imageRefusal;
    /** Keep the caption, tell the agent what was left out, and tell the user why. */
    private declined;
    /** Resolve a file id and pull its bytes, refusing anything oversized. */
    private download;
}
//# sourceMappingURL=collect.d.ts.map