/**
 * Borrowing the next chat message as an answer.
 *
 * When a question offers no options — or the user picks "Other…" — the answer
 * is whatever they type next. That message would otherwise be routed to the
 * agent as a new prompt, so the capture has to be consulted before ordinary
 * routing, and it has to be per-conversation: a question pending in one chat
 * must not swallow a message typed in another.
 */
export class TextCapture {
    waiting = new Map();
    /**
     * Wait for the next plain-text message in a conversation.
     *
     * A second wait on the same conversation supersedes the first, which is
     * resolved as cancelled — the agent moved on, and only one prompt can own
     * the user's next message.
     *
     * @param target - the conversation to listen in.
     * @param signal - cancels the wait when the agent gives up.
     * @returns the typed text, or undefined when cancelled.
     */
    next(target, signal) {
        const key = keyOf(target);
        this.cancel(key);
        return new Promise((resolve) => {
            if (signal?.aborted)
                return resolve(undefined);
            const onAbort = () => this.cancel(key);
            this.waiting.set(key, {
                settle: resolve,
                detach: () => signal?.removeEventListener('abort', onAbort),
            });
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
    /** Whether a conversation is currently waiting for typed input. */
    isWaiting(target) {
        return this.waiting.has(keyOf(target));
    }
    /**
     * Hand a message to a waiting prompt.
     *
     * @returns whether a prompt consumed it; false means route it normally.
     */
    deliver(target, text) {
        const key = keyOf(target);
        const capture = this.waiting.get(key);
        if (!capture)
            return false;
        this.waiting.delete(key);
        capture.detach();
        capture.settle(text);
        return true;
    }
    /** Cancel every wait — the plugin is unloading. */
    dispose() {
        for (const key of [...this.waiting.keys()])
            this.cancel(key);
    }
    /** Cancel one conversation's wait. */
    cancel(key) {
        const capture = this.waiting.get(key);
        if (!capture)
            return;
        this.waiting.delete(key);
        capture.detach();
        capture.settle(undefined);
    }
}
/** Conversation key; a forum topic is its own conversation. */
function keyOf(target) {
    return target.threadId === undefined ? target.chatId : `${target.chatId}#${target.threadId}`;
}
//# sourceMappingURL=text-capture.js.map