/**
 * Getting a conversation out of a state it cannot leave on its own.
 *
 * Some failures are transient and worth retrying. One is not: a provider
 * inspects the whole request history for images, so once a session's log holds
 * one, every later turn fails on a model that cannot read it — however plain
 * that turn's own text. Retrying is futile, and the user has no way of knowing
 * that from the error, which talks about image input on a message they may
 * have sent an hour ago.
 *
 * The only exit is a new session, and asking the user to remember a command
 * for it is asking them to diagnose the plugin. So the plugin recognises the
 * failure and offers the exit as a button.
 */
import type { ChatTarget } from '../interact/surface.js';
import type { ChatSurface } from '../interact/surface.js';
import type { PendingRegistry } from '../interact/pending.js';
import type { Logger } from '../harness/types.js';
/** How a turn failed, as the session log reports it. */
export interface TurnFailure {
    readonly message: string;
    readonly code?: string;
}
/**
 * Whether only a new conversation can clear this failure.
 *
 * `UNSUPPORTED_CONTENT` is the provider saying the request carries something
 * it will not take. Since the request carries the whole history, that is not
 * about the message just sent, and nothing the user types next will help.
 */
export declare function needsFreshConversation(failure: TurnFailure): boolean;
/** Everything the offer needs from the rest of the plugin. */
export interface RecoveryOfferOptions {
    readonly surface: ChatSurface;
    readonly pending: PendingRegistry<unknown>;
    /** Resolve a session id to its chat, or undefined when it is not a Telegram one. */
    readonly targetOf: (sessionId: string) => ChatTarget | undefined;
    /** Forget the conversation's session, exactly as `/new` does. */
    readonly reset: (target: ChatTarget) => Promise<void>;
}
export declare class RecoveryOffer {
    private readonly options;
    private readonly logger;
    /** Conversations already offered a way out, so a retry loop cannot spam. */
    private readonly offered;
    constructor(options: RecoveryOfferOptions, logger?: Logger);
    /**
     * Tell the user a turn failed, and offer the exit when there is one.
     *
     * @param sessionId - the session whose turn failed.
     * @param failure - the structured failure from the session log.
     */
    offer(sessionId: string, failure: TurnFailure): Promise<void>;
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open offer.
     */
    handleCallback(data: string | undefined): boolean;
    /** Forget every outstanding offer — the plugin is unloading. */
    dispose(): void;
    /** Post one notice, swallowing delivery failures. */
    private say;
}
//# sourceMappingURL=recovery.d.ts.map