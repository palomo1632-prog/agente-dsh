/**
 * Borrowing the next chat message as an answer.
 *
 * When a question offers no options — or the user picks "Other…" — the answer
 * is whatever they type next. That message would otherwise be routed to the
 * agent as a new prompt, so the capture has to be consulted before ordinary
 * routing, and it has to be per-conversation: a question pending in one chat
 * must not swallow a message typed in another.
 */
import type { ChatTarget } from './surface.js';
export declare class TextCapture {
    private readonly waiting;
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
    next(target: ChatTarget, signal?: AbortSignal): Promise<string | undefined>;
    /** Whether a conversation is currently waiting for typed input. */
    isWaiting(target: ChatTarget): boolean;
    /**
     * Hand a message to a waiting prompt.
     *
     * @returns whether a prompt consumed it; false means route it normally.
     */
    deliver(target: ChatTarget, text: string): boolean;
    /** Cancel every wait — the plugin is unloading. */
    dispose(): void;
    /** Cancel one conversation's wait. */
    private cancel;
}
//# sourceMappingURL=text-capture.d.ts.map