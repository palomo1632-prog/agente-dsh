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
import type { ChatTarget } from '../interact/surface.js';
/** The one Bot API call this needs. */
export interface ChatActionSender {
    sendChatAction?(chatId: string, action: 'typing', threadId?: number): Promise<void>;
}
/** Construction options. */
export interface TypingIndicatorOptions {
    readonly chat: ChatActionSender;
    readonly refreshMs?: number;
    readonly maxHoldMs?: number;
}
export declare class TypingIndicator {
    private readonly options;
    private readonly held;
    constructor(options: TypingIndicatorOptions);
    /**
     * Show that this conversation is being worked on, until released.
     *
     * @param target - the conversation to show it in.
     * @returns a release function, safe to call more than once.
     */
    hold(target: ChatTarget): () => void;
    /** Stop every indicator — the plugin is unloading. */
    dispose(): void;
    /** Send one action, swallowing whatever it does; this is decoration. */
    private send;
    /** Forget a conversation's indicator and stop its timers. */
    private clear;
}
//# sourceMappingURL=typing.d.ts.map