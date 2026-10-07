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
import { escapeHtml } from '../render/escape.js';
import { SILENT_LOGGER } from '../harness/types.js';
/** Prefix marking callback data as belonging to a recovery offer. */
const KIND = 'r';
/**
 * Whether only a new conversation can clear this failure.
 *
 * `UNSUPPORTED_CONTENT` is the provider saying the request carries something
 * it will not take. Since the request carries the whole history, that is not
 * about the message just sent, and nothing the user types next will help.
 */
export function needsFreshConversation(failure) {
    if (failure.code === 'UNSUPPORTED_CONTENT')
        return true;
    return /does not (?:accept|support) image input/i.test(failure.message);
}
export class RecoveryOffer {
    options;
    logger;
    /** Conversations already offered a way out, so a retry loop cannot spam. */
    offered = new Set();
    constructor(options, logger) {
        this.options = options;
        this.logger = logger ?? SILENT_LOGGER;
    }
    /**
     * Tell the user a turn failed, and offer the exit when there is one.
     *
     * @param sessionId - the session whose turn failed.
     * @param failure - the structured failure from the session log.
     */
    async offer(sessionId, failure) {
        const target = this.options.targetOf(sessionId);
        if (!target)
            return;
        const stuck = needsFreshConversation(failure);
        if (!stuck) {
            // A failure that may pass on its own needs no button, only saying so.
            await this.say(target, `⚠️ ${escapeHtml(failure.message)}`);
            return;
        }
        if (this.offered.has(sessionId))
            return;
        this.offered.add(sessionId);
        const waiter = this.options.pending.open({
            onCancel: () => this.offered.delete(sessionId),
        });
        await this.say(target, [
            `⚠️ ${escapeHtml(failure.message)}`,
            '',
            'Esta conversación no puede seguir con el modelo actual: un mensaje anterior ' +
                'lleva contenido que el modelo no acepta. Una conversación nueva lo destraba.',
        ].join('\n'), [[{ text: '🆕 Empezar una conversación nueva', callbackData: `${KIND}:${waiter.token}:0` }]]);
        const pressed = await waiter.promise;
        this.offered.delete(sessionId);
        if (pressed === undefined)
            return;
        try {
            await this.options.reset(target);
            await this.say(target, '🆕 Empecé una conversación nueva. Mandá tu mensaje de nuevo.');
        }
        catch (error) {
            this.logger.error('[dsh-telegram] could not start a fresh conversation', error);
            await this.say(target, '⚠️ No pude empezar una conversación nueva. Probá /new.');
        }
    }
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open offer.
     */
    handleCallback(data) {
        if (data === undefined)
            return false;
        const parts = data.split(':');
        if (parts.length !== 3 || parts[0] !== KIND)
            return false;
        const token = parts[1];
        if (token === '')
            return false;
        return this.options.pending.settle(token, { token });
    }
    /** Forget every outstanding offer — the plugin is unloading. */
    dispose() {
        this.offered.clear();
    }
    /** Post one notice, swallowing delivery failures. */
    async say(target, html, keyboard) {
        try {
            await this.options.surface.send(target, html, keyboard);
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not deliver a recovery offer', error);
        }
    }
}
//# sourceMappingURL=recovery.js.map