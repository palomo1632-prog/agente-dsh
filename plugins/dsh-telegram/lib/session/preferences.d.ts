/**
 * One durable string a conversation chose for itself.
 *
 * Two things need this and they are the same shape: the directory a chat works
 * in, and the model it talks to. Both are per conversation, both must outlive
 * `/new` — a preference discarded with the session would silently snap back to
 * the deployment default on the next message — and both must outlive a
 * restart.
 *
 * Kept apart from the session binding for exactly that reason: a binding is
 * one conversation with the agent and dies with `/new`, while a preference
 * belongs to the CHAT.
 */
import type { ChatTarget } from '../interact/surface.js';
/** Construction options. */
export interface ChatPreferenceOptions {
    /**
     * Whether a stored value is still usable.
     *
     * Applied on read rather than only on write, because the file outlives the
     * process that wrote it: a path that was absolute, or a model that was
     * configured, may be neither by the time it is read back.
     */
    readonly accept: (value: string) => boolean;
}
export declare class ChatPreferences {
    private readonly file;
    private readonly accept;
    private values;
    private constructor();
    /**
     * Load the store, or start empty when there is nothing readable yet.
     *
     * A corrupt file costs the conversation its preference, which one command
     * restores; refusing to start would cost the whole bot.
     *
     * @param file - absolute path to the JSON document.
     * @param options - how to tell a usable value from one to drop.
     */
    static open(file: string, options: ChatPreferenceOptions): Promise<ChatPreferences>;
    /** What this conversation chose, if it chose anything. */
    forChat(target: ChatTarget): string | undefined;
    /**
     * Remember a conversation's choice.
     *
     * @param target - the conversation.
     * @param value - the value, already checked by the caller.
     */
    set(target: ChatTarget, value: string): Promise<void>;
    /** Forget it, returning the conversation to the deployment default. */
    clear(target: ChatTarget): Promise<void>;
    /** Write the document atomically, so a crash cannot leave a half file. */
    private persist;
}
//# sourceMappingURL=preferences.d.ts.map