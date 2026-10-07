/**
 * Answering the agent's questions from Telegram.
 *
 * This is the half of the plugin that has no equivalent in the existing
 * channel bridge. When the agent calls `ask_user_question`, the harness blocks
 * the tool call on `ctx.userQuestions.ask()` and waits for the single
 * registered UI provider to return an answer. Until now that provider was
 * always the browser, so a conversation held entirely in Telegram would stall
 * on the first question with no way to answer it.
 *
 * This provider renders each question as a message with an inline keyboard,
 * parks the promise, and resolves it when a button is pressed — minutes later,
 * in a different HTTP request, possibly on a different device.
 *
 * Two details are load-bearing:
 *
 * - **Delegation.** The harness allows exactly one provider. When the browser
 *   already registered one, this provider takes over and forwards every
 *   question that does not belong to a Telegram-bound session back to it, so
 *   installing this plugin never takes the web UI's questions away.
 * - **Multi-select re-parks.** A toggle is not an answer, so each press settles
 *   its waiter and opens a fresh one for the redrawn keyboard. The token
 *   changes every round, which also makes a stale button inert.
 */
import type { AskUserQuestionAnswer, UserQuestionProvider, UserQuestionRequest } from '../harness/types.js';
import type { ChatSurface, ChatTarget } from './surface.js';
import type { PendingRegistry } from './pending.js';
/** Thrown when the agent abandons a question before the user answers it. */
export declare class QuestionCancelledError extends Error {
    constructor();
}
/** Thrown when a question arrives for a session with nowhere to ask it. */
export declare class NoChatError extends Error {
    constructor(sessionId: string);
}
/** What one button press means. */
interface Press {
    readonly token: string;
    readonly index: number;
}
/** Everything the provider needs from the rest of the plugin. */
export interface QuestionProviderOptions {
    /** Where prompts are posted and revised. */
    readonly surface: ChatSurface;
    /** Parked waiters, shared with the update dispatcher that routes presses. */
    readonly pending: PendingRegistry<unknown>;
    /** Resolve a session id to its Telegram chat, or undefined when unbound. */
    readonly targetOf: (sessionId: string) => ChatTarget | undefined;
    /** Read the next plain-text message in a chat — the "Other" answer path. */
    readonly readText: (target: ChatTarget, signal?: AbortSignal) => Promise<string | undefined>;
    /** The provider registered before this one; receives every non-Telegram question. */
    readonly fallback?: UserQuestionProvider;
}
export declare class TelegramQuestionProvider implements UserQuestionProvider {
    private readonly options;
    /**
     * Where non-Telegram questions go. Settable after construction because the
     * incumbent provider is only knowable at the moment this one displaces it.
     */
    private fallback;
    constructor(options: QuestionProviderOptions);
    /**
     * Point delegation at the provider this one displaced.
     *
     * @param provider - the incumbent, which keeps answering its own sessions.
     */
    setFallback(provider: UserQuestionProvider | undefined): void;
    /**
     * Ask the human, one question at a time.
     *
     * @param request - the questions, the owning agent, and the agent's signal.
     * @returns the answers, in request order.
     * @throws {NoChatError} when the session has no Telegram chat and no
     *   provider to delegate to.
     * @throws {QuestionCancelledError} when the agent gives up first.
     */
    ask(request: UserQuestionRequest): Promise<AskUserQuestionAnswer>;
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open question.
     */
    handleCallback(data: string | undefined): boolean;
    /** Ask one question and hold the chat open until it is answered. */
    private askOne;
    /** A question with no options is an open one: read the user's next message. */
    private askFreeText;
    /** Replace a prompt with its outcome and take the buttons away. */
    private retire;
}
/**
 * Decode `callback_data` produced by this module.
 *
 * @param data - raw callback data, from an untrusted update.
 * @returns the press, or undefined when the data belongs elsewhere or is malformed.
 */
export declare function decodeCallback(data: string | undefined): Press | undefined;
export {};
//# sourceMappingURL=questions.d.ts.map