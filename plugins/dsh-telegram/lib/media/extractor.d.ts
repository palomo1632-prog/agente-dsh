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
import type { PromptPart } from './collect.js';
import type { ModelRoute } from '../harness/model-selection.js';
import type { Logger } from '../harness/types.js';
/** A live agent driven for exactly one turn. */
export interface ExtractionAgent {
    readonly sessionId: string;
    followup(content: readonly PromptPart[]): void;
    dispose(): Promise<void>;
}
/** Creating the throwaway agent the extraction runs on. */
export interface ExtractionHost {
    create(sessionId: string, cwd: string, route: ModelRoute): Promise<ExtractionAgent>;
}
/** The session-event shapes an extraction watches for. */
export interface ExtractionEvent {
    readonly type: string;
    readonly data?: unknown;
}
/** Reading an image's text without a model, when there is no model. */
export interface FallbackReader {
    available(): Promise<boolean>;
    read(data: Uint8Array): Promise<string | undefined>;
}
/** Fetching the bytes back for a stored attachment. */
export interface AttachmentReader {
    readImage(ref: unknown): Promise<{
        data: Uint8Array;
    }>;
}
/** Construction options. */
export interface VisionExtractorOptions {
    readonly host: ExtractionHost;
    readonly cwd: string;
    /**
     * Whether any vision model is configured anywhere.
     *
     * Only decides {@link VisionExtractor.available}; which model a particular
     * conversation reads with is passed to `resolve`, because `/vision` makes
     * that a per-conversation answer.
     */
    readonly visionModel: () => ModelRoute | undefined;
    /**
     * OCR, for when no vision model is configured or the one configured could
     * not be reached. Strictly a fallback: it reads text and does not see, so a
     * model that can look is always preferred.
     */
    readonly fallback?: FallbackReader;
    /** Reads a stored image back, which the fallback needs and the model does not. */
    readonly attachments?: AttachmentReader;
    readonly newSessionId?: () => string;
    readonly timeoutMs?: number;
    readonly logger?: Logger;
}
export declare class VisionExtractor {
    private readonly options;
    private readonly pending;
    private readonly logger;
    private counter;
    constructor(options: VisionExtractorOptions);
    /**
     * Whether an image can be read at all right now.
     *
     * Optimistic about the fallback: probing Tesseract spawns a process, and
     * this is consulted on the path of every message. A fallback that turns out
     * to be absent simply reads nothing, which is the same outcome as saying so
     * here would have been.
     */
    get available(): boolean;
    /**
     * Replace image parts with what a vision model reads in them.
     *
     * @param content - the prompt as the user sent it.
     * @returns the same prompt with each image replaced by its reading, or the
     *   original content when there is nothing to read or no model to read it.
     */
    resolve(content: readonly PromptPart[], route?: ModelRoute | undefined): Promise<PromptPart[]>;
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
    private scan;
    /**
     * Consume one session event.
     *
     * @returns whether it belonged to an extraction, so the caller knows not to
     *   treat it as a conversation of its own.
     */
    handle(sessionId: string, event: ExtractionEvent): boolean;
    /** Abandon every extraction in flight — the plugin is unloading. */
    dispose(): void;
    /** Run one throwaway turn and return what the model said. */
    private read;
    /** A session id no conversation can collide with. */
    private nextSessionId;
}
//# sourceMappingURL=extractor.d.ts.map