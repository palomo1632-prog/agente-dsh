/**
 * Approving the agent's tool calls from Telegram.
 *
 * The harness asks for approval through the `approval/request` waterfall.
 * Unlike questions, that seam composes: a listener either decides or calls
 * `next()` to pass the request on. This answerer decides only for sessions it
 * owns and declines everything else, so the browser keeps answering for its
 * own sessions.
 *
 * The seam fails closed by design — a missing or throwing answerer yields
 * `'unavailable'`, which the harness treats as a refusal. That is the right
 * default and this module preserves it: if the chat cannot be reached, the
 * answer is `'unavailable'`, never an accidental grant.
 */
import type { ApprovalOutcome, ApprovalRequest } from '../harness/types.js';
import type { ChatSurface, ChatTarget } from './surface.js';
import type { PendingRegistry } from './pending.js';
/** A decoded approval button press. */
interface Press {
    readonly token: string;
    readonly index: number;
}
/** Everything the answerer needs from the rest of the plugin. */
export interface ApprovalAnswererOptions {
    readonly surface: ChatSurface;
    readonly pending: PendingRegistry<unknown>;
    /** Resolve a session id to its Telegram chat, or undefined when unbound. */
    readonly targetOf: (sessionId: string) => ChatTarget | undefined;
}
export declare class TelegramApprovalAnswerer {
    private readonly options;
    constructor(options: ApprovalAnswererOptions);
    /**
     * Decide one approval, or decline to.
     *
     * @param request - the pending decision from the harness waterfall.
     * @returns the outcome, or `undefined` when this session is not a Telegram
     *   one and the caller should pass the request along.
     */
    decide(request: ApprovalRequest): Promise<ApprovalOutcome | undefined>;
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open approval.
     */
    handleCallback(data: string | undefined): boolean;
    /** Replace the prompt with its outcome and take the buttons away. */
    private retire;
}
/**
 * Decode `callback_data` produced by this module.
 *
 * @param data - raw callback data, from an untrusted update.
 * @returns the press, or undefined when it belongs elsewhere or is malformed.
 */
export declare function decodeApprovalCallback(data: string | undefined): Press | undefined;
export {};
//# sourceMappingURL=approvals.d.ts.map