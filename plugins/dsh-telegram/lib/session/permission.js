/**
 * The permission preset a Telegram conversation runs under.
 *
 * A deployment picks one default for everything it runs, and that choice is
 * usually made for the surface the operator sits in front of: the web UI is
 * loopback-only, with a person watching what the agent does. A Telegram bot is
 * not that. It is reachable from anywhere, gated by a list of user ids, and
 * read on a phone — so the same `danger-full-access` that is merely convenient
 * at a desk is a different proposition over a chat app.
 *
 * This lets the two differ. It is deliberately not a second place to author
 * presets: the names come from the deployment's own table, and all this does
 * is choose among them for conversations that arrive over Telegram.
 *
 * It also decides whether the approval buttons work at all. Under a preset
 * whose approval policy is `never` nothing ever asks, so the buttons this
 * plugin registers can never appear — choosing one that asks is what turns
 * them on.
 */
import { SILENT_LOGGER } from '../harness/types.js';
/**
 * Find the preset a user's words name.
 *
 * Matched loosely against the deployment's own table rather than against a
 * fixed list: the names are the deployment's to choose, and `full access`,
 * `full-access` and `danger-full-access` are all the same request from
 * somebody typing on a phone.
 *
 * @param input - what the user typed.
 * @param names - every preset the deployment defines.
 * @returns the exact table key, or undefined when nothing matches.
 */
export function matchPreset(input, names) {
    const wanted = normalize(input);
    if (wanted === '')
        return undefined;
    const exact = names.find((name) => normalize(name) === wanted);
    if (exact !== undefined)
        return exact;
    // A shorthand is accepted only while it names ONE preset. `read` picking
    // `read-only` is helpful; a prefix shared by two would be a coin toss.
    const partial = names.filter((name) => normalize(name).includes(wanted));
    return partial.length === 1 ? partial[0] : undefined;
}
/** Compare names the way somebody types them, not the way they are stored. */
function normalize(text) {
    return text.trim().toLowerCase().replace(/[\s_-]+/g, '');
}
export class PermissionControl {
    options;
    logger;
    /** Names already reported as unknown, so one typo is not logged per turn. */
    complained = new Set();
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /** Whether this deployment can be told to use a different preset. */
    get available() {
        return this.options.presets !== undefined && this.options.sessions !== undefined;
    }
    /** Every preset name available, for a message that has to name them. */
    get names() {
        return this.options.presets?.names ?? [];
    }
    /**
     * Put one session on the configured preset.
     *
     * Applied after the session exists rather than at creation: the harness pins
     * an initial permission before publishing, and switching afterwards is the
     * supported path — it is what the web UI's own picker does mid-session.
     *
     * Failure is never fatal. A session that keeps the deployment default is
     * exactly what an unconfigured deployment gets, so a bad name costs a log
     * line rather than the user's message.
     *
     * @param sessionId - the session to switch.
     */
    apply(target, sessionId) {
        const wanted = this.options.preset(target)?.trim();
        if (!wanted)
            return;
        const { presets, sessions } = this.options;
        if (!presets || !sessions)
            return;
        if (!presets.names.includes(wanted)) {
            if (!this.complained.has(wanted)) {
                this.complained.add(wanted);
                this.logger.warn(`[dsh-telegram] unknown permission preset "${wanted}" ` +
                    `(known: ${presets.names.join(', ') || 'none'}); keeping the deployment default`);
            }
            return;
        }
        const session = sessions.get(sessionId);
        if (session === undefined) {
            this.logger.debug(`[dsh-telegram] session '${sessionId}' is not live; permission unchanged`);
            return;
        }
        try {
            presets.set(session, wanted);
        }
        catch (error) {
            this.logger.warn(`[dsh-telegram] could not apply permission preset "${wanted}"`, error);
        }
    }
}
//# sourceMappingURL=permission.js.map