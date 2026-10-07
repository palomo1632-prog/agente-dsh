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
/** How long to wait after the last part before deciding an album is complete. */
const WINDOW_MS = 1200;
/** Telegram's own album limit; anything beyond it is a different album. */
const MAX_PARTS = 10;
export class AlbumBuffer {
    options;
    gathering = new Map();
    constructor(options) {
        this.options = options;
    }
    /**
     * Take a message if it belongs to an album.
     *
     * @param message - the incoming message.
     * @returns whether it was taken; the caller should stop handling it if so,
     *   because the whole album is delivered later instead.
     */
    offer(message) {
        const id = message.media_group_id;
        if (id === undefined)
            return false;
        const existing = this.gathering.get(id);
        if (existing) {
            clearTimeout(existing.timer);
            // Beyond Telegram's own limit this is no longer one album, so the parts
            // held so far go out rather than growing without bound.
            if (existing.messages.length >= (this.options.maxParts ?? MAX_PARTS)) {
                this.gathering.delete(id);
                this.options.deliver(sorted(existing.messages));
                this.hold(id, [message]);
                return true;
            }
            existing.messages.push(message);
            existing.timer = this.arm(id);
            return true;
        }
        this.hold(id, [message]);
        return true;
    }
    /** Deliver every album still gathering — the plugin is unloading. */
    flush() {
        for (const [id, entry] of [...this.gathering]) {
            clearTimeout(entry.timer);
            this.gathering.delete(id);
            this.options.deliver(sorted(entry.messages));
        }
    }
    /** Drop every album still gathering, delivering none. */
    dispose() {
        for (const entry of this.gathering.values())
            clearTimeout(entry.timer);
        this.gathering.clear();
    }
    /** Start gathering one album. */
    hold(id, messages) {
        this.gathering.set(id, { messages, timer: this.arm(id) });
    }
    /** Arm the "it stopped growing" timer for one album. */
    arm(id) {
        const timer = setTimeout(() => {
            const entry = this.gathering.get(id);
            if (!entry)
                return;
            this.gathering.delete(id);
            this.options.deliver(sorted(entry.messages));
        }, this.options.windowMs ?? WINDOW_MS);
        // A pending album is never a reason to keep the process alive.
        timer.unref?.();
        return timer;
    }
}
/**
 * The album in the order it was sent.
 *
 * Telegram numbers the parts even when it delivers them out of order, and the
 * order is what decides which image the caption belongs to.
 */
function sorted(messages) {
    return [...messages].sort((a, b) => a.message_id - b.message_id);
}
/** The caption an album carries, which exactly one of its parts holds. */
export function captionOf(messages) {
    for (const message of messages) {
        const said = (message.caption ?? message.text)?.trim();
        if (said !== undefined && said !== '')
            return said;
    }
    return undefined;
}
//# sourceMappingURL=albums.js.map