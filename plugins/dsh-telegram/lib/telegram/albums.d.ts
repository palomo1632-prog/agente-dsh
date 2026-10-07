/**
 * Gathering an album back into one message.
 *
 * Telegram has no "several photos in one message". Sending three screenshots
 * produces three separate updates, tied together only by a shared
 * `media_group_id`, with the caption on exactly one of them. Handled one at a
 * time that becomes three turns: the first carries the question, and the other
 * two arrive as bare images the agent has no reason for.
 *
 * So a message belonging to an album is held briefly rather than answered, and
 * the group is delivered once it stops growing. The wait is the cost: it is
 * paid only by albums, and only once per album, which is a better trade than
 * answering the same question three times.
 */
import type { TelegramMessage } from './types.js';
/** Construction options. */
export interface AlbumBufferOptions {
    /** Called once per album, with its parts in the order Telegram numbered them. */
    readonly deliver: (messages: TelegramMessage[]) => void;
    readonly windowMs?: number;
    readonly maxParts?: number;
}
export declare class AlbumBuffer {
    private readonly options;
    private readonly gathering;
    constructor(options: AlbumBufferOptions);
    /**
     * Take a message if it belongs to an album.
     *
     * @param message - the incoming message.
     * @returns whether it was taken; the caller should stop handling it if so,
     *   because the whole album is delivered later instead.
     */
    offer(message: TelegramMessage): boolean;
    /** Deliver every album still gathering — the plugin is unloading. */
    flush(): void;
    /** Drop every album still gathering, delivering none. */
    dispose(): void;
    /** Start gathering one album. */
    private hold;
    /** Arm the "it stopped growing" timer for one album. */
    private arm;
}
/** The caption an album carries, which exactly one of its parts holds. */
export declare function captionOf(messages: readonly TelegramMessage[]): string | undefined;
//# sourceMappingURL=albums.d.ts.map