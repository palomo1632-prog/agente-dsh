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
import { escapeHtml } from '../render/escape.js';
import { escapeWithin } from '../render/clamp.js';
/** Prefix marking callback data as belonging to an approval. */
const KIND = 'a';
/**
 * Budgets for the two model-authored parts, chosen to leave the assembled
 * message comfortably inside Telegram's 4096-character limit. A prompt that
 * cannot be sent is an approval nobody is asked about.
 */
const TOOL_NAME_BUDGET = 120;
const REASON_BUDGET = 2600;
/** Button order, and the outcome each press produces. */
const CHOICES = [
    { text: '✅ Permitir una vez', outcome: 'allowed-once' },
    { text: '⛔ Rechazar', outcome: 'rejected' },
];
export class TelegramApprovalAnswerer {
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * Decide one approval, or decline to.
     *
     * @param request - the pending decision from the harness waterfall.
     * @returns the outcome, or `undefined` when this session is not a Telegram
     *   one and the caller should pass the request along.
     */
    async decide(request) {
        const sessionId = request.agent.session.id ?? request.agent.id;
        const target = this.options.targetOf(sessionId);
        if (!target)
            return undefined;
        if (request.signal?.aborted)
            return 'cancelled';
        let messageId;
        const waiter = this.options.pending.open({
            ...(request.signal ? { signal: request.signal } : {}),
            onCancel: () => void this.retire(target, messageId, request, 'Cancelled.'),
        });
        try {
            messageId = await this.options.surface.send(target, renderRequest(request), buildKeyboard(waiter.token));
        }
        catch {
            // Fail closed: an unreachable chat must never read as consent.
            this.options.pending.cancel(waiter.token);
            return 'unavailable';
        }
        const press = (await waiter.promise);
        if (!press)
            return 'cancelled';
        const choice = CHOICES[press.index];
        if (!choice)
            return 'unavailable';
        await this.retire(target, messageId, request, choice.text);
        return choice.outcome;
    }
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open approval.
     */
    handleCallback(data) {
        const press = decodeApprovalCallback(data);
        if (!press)
            return false;
        return this.options.pending.settle(press.token, press);
    }
    /** Replace the prompt with its outcome and take the buttons away. */
    async retire(target, messageId, request, outcome) {
        if (messageId === undefined)
            return;
        const html = `${renderRequest(request)}\n\n<b>${escapeHtml(outcome)}</b>`;
        await this.options.surface.edit(target, messageId, html, []).catch(() => undefined);
    }
}
/**
 * Decode `callback_data` produced by this module.
 *
 * @param data - raw callback data, from an untrusted update.
 * @returns the press, or undefined when it belongs elsewhere or is malformed.
 */
export function decodeApprovalCallback(data) {
    if (data === undefined)
        return undefined;
    const parts = data.split(':');
    if (parts.length !== 3 || parts[0] !== KIND)
        return undefined;
    const token = parts[1];
    const index = Number(parts[2]);
    if (token === '' || !Number.isInteger(index))
        return undefined;
    return { token, index };
}
/**
 * The prompt itself. The reason is model-authored, so it is escaped rather
 * than rendered as markdown — an approval prompt is the last place to let
 * generated text control the formatting.
 */
function renderRequest(request) {
    const lines = [
        `🔐 <b>Approval needed</b>`,
        `Tool: <code>${escapeWithin(request.toolName, TOOL_NAME_BUDGET)}</code>`,
    ];
    if (request.reason) {
        lines.push('');
        lines.push(`<blockquote>${escapeWithin(request.reason, REASON_BUDGET)}</blockquote>`);
    }
    return lines.join('\n');
}
/** One button per outcome, each on its own row so neither is mispressed. */
function buildKeyboard(token) {
    return CHOICES.map((choice, index) => [
        { text: choice.text, callbackData: `${KIND}:${token}:${index}` },
    ]);
}
//# sourceMappingURL=approvals.js.map