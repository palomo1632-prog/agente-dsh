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
import { escapeHtml } from '../render/escape.js';
import { clamp, escapeWithin } from '../render/clamp.js';
/** Prefix marking callback data as belonging to a question. */
const KIND = 'q';
/** Index reserved for the "answer in your own words" button. */
const OTHER_INDEX = -1;
/** Index reserved for the multi-select "Done" button. */
const DONE_INDEX = -2;
/** Telegram truncates long button labels awkwardly; do it deliberately instead. */
const MAX_BUTTON_LABEL = 48;
/**
 * Budgets for the model-authored parts of a prompt. Together with the option
 * cap below they keep the assembled message inside Telegram's 4096-character
 * limit, so a verbose question can never become a question nobody is shown.
 */
const HEADER_BUDGET = 120;
const QUESTION_BUDGET = 1200;
const DESCRIPTION_BUDGET = 220;
/** Descriptions rendered in the body; the rest are still selectable buttons. */
const MAX_DESCRIBED_OPTIONS = 8;
/** Thrown when the agent abandons a question before the user answers it. */
export class QuestionCancelledError extends Error {
    constructor() {
        super('ask_user_question was cancelled before the user answered');
        this.name = 'QuestionCancelledError';
    }
}
/** Thrown when a question arrives for a session with nowhere to ask it. */
export class NoChatError extends Error {
    constructor(sessionId) {
        super(`no telegram chat is bound to session '${sessionId}'`);
        this.name = 'NoChatError';
    }
}
export class TelegramQuestionProvider {
    options;
    /**
     * Where non-Telegram questions go. Settable after construction because the
     * incumbent provider is only knowable at the moment this one displaces it.
     */
    fallback;
    constructor(options) {
        this.options = options;
        this.fallback = options.fallback;
    }
    /**
     * Point delegation at the provider this one displaced.
     *
     * @param provider - the incumbent, which keeps answering its own sessions.
     */
    setFallback(provider) {
        this.fallback = provider;
    }
    /**
     * Whether this provider owns the chat a session is bound to.
     *
     * DSH 0.2.0 routes questions through a Cordis waterfall instead of a single
     * provider slot, so the seam asks this before claiming a request: a session
     * with a Telegram chat is answered here, anything else falls through to the
     * next listener (the web UI).
     *
     * @param sessionId - the asking session's id.
     * @returns true when a Telegram chat is bound to that session.
     */
    handles(sessionId) {
        return sessionId !== undefined && this.options.targetOf(sessionId) !== undefined;
    }
    /**
     * Ask the human, one question at a time.
     *
     * @param request - the questions, the owning agent, and the agent's signal.
     * @returns the answers, in request order.
     * @throws {NoChatError} when the session has no Telegram chat and no
     *   provider to delegate to.
     * @throws {QuestionCancelledError} when the agent gives up first.
     */
    async ask(request) {
        const sessionId = request.agent?.session.id ?? request.agent?.id;
        const target = sessionId === undefined ? undefined : this.options.targetOf(sessionId);
        if (!target) {
            if (this.fallback)
                return this.fallback.ask(request);
            throw new NoChatError(sessionId ?? '<unknown>');
        }
        const answers = [];
        for (const question of request.questions) {
            answers.push(await this.askOne(question, target, request.signal));
        }
        return { answers };
    }
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open question.
     */
    handleCallback(data) {
        const press = decodeCallback(data);
        if (!press)
            return false;
        return this.options.pending.settle(press.token, press);
    }
    /** Ask one question and hold the chat open until it is answered. */
    async askOne(question, target, signal) {
        if (question.detail !== undefined) {
            // Agent-authored markdown — a plan, a diff — so Telegram renders it.
            await this.options.surface.sendMarkdown(target, question.detail);
        }
        const options = question.options ?? [];
        if (options.length === 0)
            return this.askFreeText(question, target, signal);
        let selected = [];
        let messageId;
        for (;;) {
            const waiter = this.options.pending.open({
                ...(signal ? { signal } : {}),
                onCancel: () => void this.retire(target, messageId, question, 'Cancelado.'),
            });
            const html = renderPrompt(question, selected);
            const keyboard = buildKeyboard(question, selected, waiter.token);
            if (messageId === undefined)
                messageId = await this.options.surface.send(target, html, keyboard);
            else
                await this.options.surface.edit(target, messageId, html, keyboard);
            const press = (await waiter.promise);
            if (!press)
                throw new QuestionCancelledError();
            if (press.index === OTHER_INDEX) {
                const custom = await this.options.readText(target, signal);
                if (custom === undefined)
                    throw new QuestionCancelledError();
                await this.retire(target, messageId, question, `Answered: ${clamp(custom, 200)}`);
                return { id: question.id, selected: [], custom };
            }
            if (press.index === DONE_INDEX) {
                const labels = selected.map((index) => options[index]?.label ?? '');
                await this.retire(target, messageId, question, summary(labels));
                return { id: question.id, selected: labels };
            }
            if (!question.multiSelect) {
                const label = options[press.index]?.label;
                if (label === undefined)
                    continue;
                await this.retire(target, messageId, question, summary([label]));
                return { id: question.id, selected: [label] };
            }
            selected = toggle(selected, press.index);
        }
    }
    /** A question with no options is an open one: read the user's next message. */
    async askFreeText(question, target, signal) {
        await this.options.surface.send(target, renderPrompt(question, []));
        const custom = await this.options.readText(target, signal);
        if (custom === undefined)
            throw new QuestionCancelledError();
        return { id: question.id, selected: [], custom };
    }
    /** Replace a prompt with its outcome and take the buttons away. */
    async retire(target, messageId, question, outcome) {
        if (messageId === undefined)
            return;
        const html = `${renderPrompt(question, [])}\n\n<b>${escapeWithin(outcome, 400)}</b>`;
        await this.options.surface.edit(target, messageId, html, []).catch(() => undefined);
    }
}
/**
 * Decode `callback_data` produced by this module.
 *
 * @param data - raw callback data, from an untrusted update.
 * @returns the press, or undefined when the data belongs elsewhere or is malformed.
 */
export function decodeCallback(data) {
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
/** Add or remove an index, preserving the order options were chosen in. */
function toggle(selected, index) {
    return selected.includes(index)
        ? selected.filter((value) => value !== index)
        : [...selected, index];
}
/** The question itself: header, prompt, and any option descriptions. */
function renderPrompt(question, selected) {
    const lines = [];
    if (question.header)
        lines.push(`<b>${escapeWithin(question.header, HEADER_BUDGET)}</b>`);
    lines.push(escapeWithin(question.question, QUESTION_BUDGET));
    const described = (question.options ?? [])
        .filter((option) => option.description)
        .slice(0, MAX_DESCRIBED_OPTIONS);
    if (described.length > 0) {
        lines.push('');
        for (const option of described) {
            lines.push(`• <b>${escapeWithin(option.label, MAX_BUTTON_LABEL * 2)}</b> — ` +
                `${escapeWithin(option.description, DESCRIPTION_BUDGET)}`);
        }
    }
    if (question.multiSelect) {
        lines.push('');
        lines.push(`<i>Pick any number, then press Done (${selected.length} selected).</i>`);
    }
    return lines.join('\n');
}
/** Buttons for one question: the options, plus Done and Other where they apply. */
function buildKeyboard(question, selected, token) {
    const approve = question.intent?.approve;
    const rows = (question.options ?? []).map((option, index) => [
        {
            text: label(option.label, {
                checked: question.multiSelect === true && selected.includes(index),
                approving: approve !== undefined && option.label === approve,
            }),
            callbackData: `${KIND}:${token}:${index}`,
        },
    ]);
    if (question.multiSelect) {
        rows.push([{ text: '✅ Listo', callbackData: `${KIND}:${token}:${DONE_INDEX}` }]);
    }
    else {
        rows.push([{ text: '✏️ Otro…', callbackData: `${KIND}:${token}:${OTHER_INDEX}` }]);
    }
    return rows;
}
/** One button label: trimmed to length, marked as chosen or as the approval. */
function label(text, marks) {
    const trimmed = text.length > MAX_BUTTON_LABEL ? `${text.slice(0, MAX_BUTTON_LABEL - 1)}…` : text;
    if (marks.checked)
        return `✅ ${trimmed}`;
    if (marks.approving)
        return `👍 ${trimmed}`;
    return trimmed;
}
/** Human summary of what was chosen, for the retired prompt. */
function summary(labels) {
    return labels.length === 0 ? 'Respondido: no elegiste nada' : `Respondido: ${labels.join(', ')}`;
}
//# sourceMappingURL=questions.js.map