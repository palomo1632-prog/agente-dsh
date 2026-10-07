/**
 * A status file, because the log is not always readable.
 *
 * `ctx.logger` reaches whatever sink the deployment composed — and several
 * profiles compose none, so a plugin that only logs its failures is silent
 * about them. That is how a bot ends up not answering with nothing anywhere
 * to say why: the token was missing, or Telegram refused it, and the one line
 * that said so went nowhere.
 *
 * So the plugin also writes what it is doing to a small JSON file beside its
 * other state. It is written on every transition, is safe to read while the
 * plugin runs, and never contains the token.
 */
/** What the connection is doing right now. */
export type ConnectionState = 
/** Loaded but deliberately not connecting: disabled, or no token yet. */
'idle'
/** Opening: verifying the token and clearing any webhook. */
 | 'connecting'
/** Long-polling for updates. */
 | 'connected'
/** Stopped by an error; `detail` says which. */
 | 'failed';
/** One published status. */
export interface StatusSnapshot {
    readonly state: ConnectionState;
    /** The bot's @username, once known. */
    readonly bot?: string;
    /** Why, for the states that need a why. Never contains the token. */
    readonly detail?: string;
    /** When this was written, ISO-8601. */
    readonly updatedAt: string;
}
/** Publishes the connection's state where a person can read it. */
export declare class StatusFile {
    private readonly file;
    /** Strips the bot token from any text bound for the file. */
    private readonly redact;
    constructor(file: string, 
    /** Strips the bot token from any text bound for the file. */
    redact?: (text: string) => string);
    /**
     * Publish a state.
     *
     * Failures are swallowed: a plugin must not fall over because it could not
     * write its own diagnostics.
     *
     * @param state - what the connection is doing.
     * @param extra - the bot username and reason, where they apply.
     */
    publish(state: ConnectionState, extra?: {
        bot?: string;
        detail?: string | undefined;
    }): Promise<void>;
}
/** Reduce any thrown value to one readable line. */
export declare function describeError(error: unknown): string;
//# sourceMappingURL=diagnostics.d.ts.map