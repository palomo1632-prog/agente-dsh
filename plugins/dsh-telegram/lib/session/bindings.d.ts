/**
 * Which harness session each Telegram conversation is talking to.
 *
 * This mapping has to outlive the process: a user who messages the bot on
 * Monday and again on Tuesday expects the same conversation, and the harness
 * can resume the session from its log — but only if we still remember which
 * session id belonged to that chat.
 *
 * The reverse direction matters just as much. When the agent asks a question,
 * all we have is a session id, and we need the chat to ask in. So both
 * directions are indexed, and every mutation keeps them consistent.
 *
 * A group's forum topics are separate conversations: the same chat id with a
 * different thread id gets its own session, because that is how the people in
 * the group are already using it.
 */
import type { ChatTarget } from '../interact/surface.js';
/** One remembered conversation. */
export interface Binding {
    readonly chatId: string;
    readonly threadId?: number;
    readonly sessionId: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    /**
     * Whether this session's log carries an image.
     *
     * A provider checks the WHOLE request history for images, not just the new
     * message, so one image makes every later turn fail on a model that cannot
     * see. The flag is durable because that fact outlives the process: after a
     * restart the conversation must still be routed somewhere that can read it.
     */
    readonly hasImages?: boolean;
}
export declare class BindingStore {
    private readonly file;
    /** Keyed by conversation key; the durable form. */
    private bindings;
    /** Session id → conversation key; derived, rebuilt on every mutation. */
    private bySession;
    private constructor();
    /**
     * Load the store, or start empty when there is nothing readable yet.
     *
     * A corrupt file is not fatal: losing the mapping costs the user their
     * conversation continuity, while refusing to start costs them the bot.
     *
     * @param file - absolute path to the JSON document.
     */
    static open(file: string): Promise<BindingStore>;
    /** The binding for a conversation, if it has one. */
    forChat(target: ChatTarget): Binding | undefined;
    /** The conversation a session belongs to, if any. */
    forSession(sessionId: string): ChatTarget | undefined;
    /** Every remembered conversation. */
    list(): Binding[];
    /**
     * Bind a conversation to a session, replacing any previous binding.
     *
     * @param target - the conversation.
     * @param sessionId - the harness session it now talks to.
     */
    bind(target: ChatTarget, sessionId: string): Promise<void>;
    /**
     * Record that this conversation's session log now carries an image.
     *
     * @param target - the conversation.
     */
    markImages(target: ChatTarget): Promise<void>;
    /**
     * Forget a conversation's binding, so its next message starts fresh.
     *
     * @param target - the conversation to forget.
     */
    unbind(target: ChatTarget): Promise<void>;
    /** Swap in a new binding set and rebuild the session index from it. */
    private replaceAll;
    /** Write the document atomically, so a crash cannot leave a half file. */
    private persist;
}
//# sourceMappingURL=bindings.d.ts.map