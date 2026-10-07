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
import type { ChatTarget } from '../interact/surface.js';
import type { Logger } from '../harness/types.js';
/** The deployment's preset table, narrowed to what this needs. */
export interface PermissionPresetsLike {
    /** Every preset name the deployment defines. */
    readonly names: readonly string[];
    /** Switch one session onto a preset; an unknown name throws. */
    set(session: unknown, name: string): void;
}
/** Looking up a live session by id. */
export interface SessionLookup {
    get(sessionId: string): unknown;
}
/** Construction options. */
export interface PermissionControlOptions {
    readonly presets?: PermissionPresetsLike;
    readonly sessions?: SessionLookup;
    /**
     * The preset this conversation should run under; empty or undefined leaves
     * the deployment default. Read per session so a change lands on the next
     * conversation rather than the next restart.
     */
    readonly preset: (target: ChatTarget) => string | undefined;
    readonly logger?: Logger;
}
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
export declare function matchPreset(input: string, names: readonly string[]): string | undefined;
export declare class PermissionControl {
    private readonly options;
    private readonly logger;
    /** Names already reported as unknown, so one typo is not logged per turn. */
    private readonly complained;
    constructor(options: PermissionControlOptions);
    /** Whether this deployment can be told to use a different preset. */
    get available(): boolean;
    /** Every preset name available, for a message that has to name them. */
    get names(): readonly string[];
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
    apply(target: ChatTarget, sessionId: string): void;
}
//# sourceMappingURL=permission.d.ts.map