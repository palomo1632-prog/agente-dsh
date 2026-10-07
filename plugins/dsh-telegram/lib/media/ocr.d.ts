/**
 * Reading the text in an image without a model.
 *
 * A fallback, and only that. When no vision model is configured the image is
 * otherwise refused before it is even downloaded, and the user gets a sentence
 * about model configuration instead of an answer. Poor OCR beats nothing, and
 * the thing people most often send a coding agent from a phone — a screenshot
 * of an error, a log, a stack trace — is exactly what OCR is good at: crisp
 * text, high contrast, no perspective.
 *
 * What it is NOT is a vision model. It reads text; it does not see. A
 * whiteboard, an architecture diagram, a chart, a UI layout all come back as
 * scattered words with no structure and nothing to say what the picture was.
 * So its output is labelled as OCR wherever it goes — an agent handed
 * unlabelled OCR treats a misread digit as a fact.
 *
 * Tesseract is never assumed. It ships with no operating system this runs on,
 * so its absence is the normal case and is detected rather than discovered
 * halfway through a message.
 */
import type { Logger } from '../harness/types.js';
/** Running a command; injected so tests need no Tesseract. */
export type CommandRunner = (command: string, args: readonly string[], signal: AbortSignal) => Promise<string>;
/** Construction options. */
export interface OcrReaderOptions {
    /** Languages to read, as Tesseract names them. Several join with `+`. */
    readonly languages?: string;
    readonly binary?: string;
    readonly run?: CommandRunner;
    readonly timeoutMs?: number;
    readonly logger?: Logger;
}
export declare class OcrReader {
    private readonly options;
    private readonly logger;
    /** Cached, because probing spawns a process and the answer cannot change. */
    private probed;
    constructor(options?: OcrReaderOptions);
    /**
     * Whether Tesseract is actually installed here.
     *
     * Probed once and remembered. A deployment without it is the ordinary case,
     * not a fault: nothing this runs on ships Tesseract.
     */
    available(): Promise<boolean>;
    /**
     * Read the text in an image.
     *
     * @param data - the image bytes.
     * @returns the text, or undefined when there was none worth having.
     */
    read(data: Uint8Array): Promise<string | undefined>;
    /** Ask Tesseract whether it is there. */
    private probe;
    /** Run the binary and return what it printed. */
    private exec;
}
/**
 * How the text is introduced to the agent.
 *
 * The caveat is not politeness. An agent handed unlabelled OCR treats a
 * misread digit as a fact, and a receipt's amount is exactly the sort of thing
 * it gets wrong.
 */
export declare function labelOcr(text: string): string;
//# sourceMappingURL=ocr.d.ts.map