/**
 * Keeping Telegram's own "typing…" indicator alive.
 *
 * `sendChatAction` lasts five seconds and then lapses, which is fine for the
 * work it was written for and useless for the work this bot does: reading an
 * image on a vision model, waiting behind another message, or a turn that
 * spends a minute in a tool call all outlast it several times over. One call
 * therefore reads as a bot that started and died.
 *
 * So a hold is taken for as long as nothing is visible in the chat, and the
 * action is re-sent inside its own expiry until the hold is released. Holds
 * are counted per conversation: the router's hold over reading an attachment
 * and the bridge's hold over a turn overlap, and the indicator should stop
 * when the last of them lets go, not the first.
 *
 * Everything here is cosmetic, so nothing it does may fail a message.
 */
/** How often to re-send. Comfortably inside Telegram's five-second expiry. */
const REFRESH_MS = 4_000;
/**
 * How long one hold may keep the indicator alive.
 *
 * A backstop, not a policy: a release that never runs — a listener dropped, a
 * turn whose end never arrives — would otherwise leave a chat typing forever.
 */
const MAX_HOLD_MS = 10 * 60 * 1000;
export class TypingIndicator {
    options;
    held = new Map();
    constructor(options) {
        this.options = options;
    }
    /**
     * Show that this conversation is being worked on, until released.
     *
     * @param target - the conversation to show it in.
     * @returns a release function, safe to call more than once.
     */
    hold(target) {
        const key = keyOf(target);
        const existing = this.held.get(key);
        if (existing) {
            existing.holders += 1;
        }
        else {
            this.send(target);
            this.held.set(key, {
                holders: 1,
                timer: setInterval(() => this.send(target), this.options.refreshMs ?? REFRESH_MS),
                deadline: setTimeout(() => this.clear(key), this.options.maxHoldMs ?? MAX_HOLD_MS),
            });
        }
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            const entry = this.held.get(key);
            if (!entry)
                return;
            entry.holders -= 1;
            if (entry.holders <= 0)
                this.clear(key);
        };
    }
    /** Stop every indicator — the plugin is unloading. */
    dispose() {
        for (const key of [...this.held.keys()])
            this.clear(key);
    }
    /** Send one action, swallowing whatever it does; this is decoration. */
    send(target) {
        void this.options.chat
            .sendChatAction?.(target.chatId, 'typing', target.threadId)
            .catch(() => undefined);
    }
    /** Forget a conversation's indicator and stop its timers. */
    clear(key) {
        const entry = this.held.get(key);
        if (!entry)
            return;
        this.held.delete(key);
        clearInterval(entry.timer);
        clearTimeout(entry.deadline);
    }
}
/** A key distinguishing forum topics, which are separate conversations. */
function keyOf(target) {
    return target.threadId === undefined ? target.chatId : `${target.chatId}#${target.threadId}`;
}
//# sourceMappingURL=typing.js.map