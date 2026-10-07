/**
 * Getting what the user sent into what the agent can read.
 *
 * Three kinds arrive and only two can go anywhere useful:
 *
 * - **Images** reach the model. The harness attachment seam accepts PNG,
 *   JPEG, WebP and GIF, commits the bytes durably, and hands back a reference
 *   the session log can carry — which is why a screenshot works at all.
 * - **Text documents** — a log, a stack trace, a source file — have no seam,
 *   but they do not need one: their content is text, so it is read and placed
 *   in the prompt where the model already looks.
 * - **Voice, audio and video** have neither. The harness explicitly defers
 *   them, so the honest answer is to say so rather than to accept the message
 *   and silently drop what it carried.
 *
 * Telegram sends an uncompressed image as a *document*, so kind is decided by
 * media type rather than by which field it arrived in.
 */
import type { TelegramMessage } from '../telegram/types.js';
import type { ImageCandidate } from './limits.js';
/** One file a message carries, and what can be done with it. */
export interface MediaItem {
    /** Telegram's handle for the bytes. */
    readonly fileId: string;
    /** What this plugin can do with it. */
    readonly kind: 'image' | 'text' | 'unsupported';
    /** Media type, where Telegram supplied one. */
    readonly mediaType?: string;
    /** File name, where one was sent. */
    readonly name?: string;
    /** Size in bytes, where Telegram reported it. */
    readonly size?: number;
    /** For `unsupported`, what it was — so the refusal can name it. */
    readonly describedAs?: string;
    /**
     * Every size this image is available in, for `image` items.
     *
     * Telegram renders a photo at several sizes and the largest routinely
     * exceeds what the harness will store, so the choice is made against the
     * seam's limits rather than here. A document arrives at one size only.
     */
    readonly candidates?: readonly ImageCandidate[];
}
/**
 * Identify the media a message carries.
 *
 * @param message - the incoming Telegram message.
 * @returns the item, or undefined for a message carrying none.
 */
export declare function describeMedia(message: TelegramMessage): MediaItem | undefined;
/**
 * Whether the harness can store this image.
 *
 * @param mediaType - the type Telegram reported.
 */
export declare function isStorableImage(mediaType: string | undefined): boolean;
//# sourceMappingURL=intake.d.ts.map