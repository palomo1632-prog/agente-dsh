/**
 * Picking up a conversation that `/new` left behind.
 *
 * The harness keeps every session's log, but the binding naming the current
 * one is replaced, so from a phone `/new` is a one-way door: someone who
 * starts a fresh conversation to ask one quick thing loses the one they were
 * in the middle of.
 *
 * Offered as buttons rather than as `/resume 3`, for the same reason the
 * recovery offer is: the list is already on screen, and asking someone to read
 * an index off it and type a number back is asking them to do a computer's
 * job. It also means there is nothing to mistype.
 */
import { escapeHtml } from '../render/escape.js';
import { SILENT_LOGGER } from '../harness/types.js';
/** Prefix marking callback data as belonging to a session picker. */
const KIND = 's';
/** How many to offer; Telegram keyboards get unusable long before this. */
const OFFER = 8;
export class SessionPicker {
    options;
    logger;
    /** One outstanding keyboard per chat or group topic. */
    active = new Map();
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /**
     * Offer this chat's earlier conversations.
     *
     * @param target - the conversation asking.
     */
    async offer(target) {
        const key = targetKey(target);
        const previous = this.active.get(key);
        if (previous !== undefined)
            this.options.pending.cancel(previous);
        this.active.delete(key);
        const current = this.options.currentSession(target);
        const past = this.options
            .history.forChat(target)
            .filter((entry) => entry.sessionId !== current)
            .slice(0, OFFER);
        if (past.length === 0) {
            await this.say(target, current === undefined
                ? 'Todavía no hay conversaciones — mandá un mensaje para empezar.'
                : 'Por ahora es la única conversación de este chat.');
            return;
        }
        const waiter = this.options.pending.open({});
        this.active.set(key, waiter.token);
        const keyboard = past.map((entry, index) => [
            {
                text: labelOf(entry),
                callbackData: `${KIND}:${waiter.token}:${index}`,
            },
        ]);
        const delivered = await this.say(target, [
            '<b>Conversaciones anteriores</b>',
            '',
            'Elegí una para seguir. La actual queda donde está.',
        ].join('\n'), keyboard);
        if (!delivered)
            this.options.pending.cancel(waiter.token);
        const pressed = await waiter.promise;
        if (this.active.get(key) === waiter.token)
            this.active.delete(key);
        if (typeof pressed !== 'string')
            return;
        const index = Number.parseInt(pressed, 10);
        const chosen = past[index];
        if (!chosen)
            return;
        try {
            await this.options.adopt(target, chosen.sessionId);
            await this.say(target, `↩️ Back in <b>${escapeHtml(labelOf(chosen))}</b>.\n\n` +
                `<code>${escapeHtml(chosen.cwd)}</code>`);
        }
        catch (error) {
            this.logger.error('[dsh-telegram] could not adopt an earlier session', error);
            await this.say(target, '⚠️ No se pudo reabrir esa conversación.');
        }
    }
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open picker.
     */
    handleCallback(data) {
        if (data === undefined)
            return false;
        const parts = data.split(':');
        if (parts.length !== 3 || parts[0] !== KIND)
            return false;
        const token = parts[1];
        const index = parts[2];
        if (token === '' || !/^\d+$/.test(index))
            return false;
        return this.options.pending.settle(token, index);
    }
    /** Post one message, swallowing delivery failures. */
    async say(target, html, keyboard) {
        try {
            await this.options.surface.send(target, html, keyboard);
            return true;
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not offer the session list', error);
            return false;
        }
    }
}
/** Stable identity for a private chat, group, or one group topic. */
function targetKey(target) {
    return target.threadId === undefined ? target.chatId : `${target.chatId}#${target.threadId}`;
}
/** A button label: what the conversation opened with, or when it started. */
function labelOf(entry) {
    if (entry.label !== undefined && entry.label !== '')
        return entry.label;
    return new Date(entry.startedAt).toISOString().slice(0, 16).replace('T', ' ');
}
//# sourceMappingURL=picker.js.map