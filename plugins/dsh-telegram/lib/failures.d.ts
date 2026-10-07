/**
 * Keeping the last things that went wrong where somebody can see them.
 *
 * `ctx.logger` reaches whatever sink the deployment composed, and several
 * profiles compose none. A plugin that only logs its failures is then silent
 * about them: the status file says whether the connection is up, and nothing
 * says that a screenshot failed, an attachment was refused, or a turn threw.
 *
 * That is not a hypothetical. Every fault found in this plugin so far was
 * found by someone noticing odd behaviour in a chat and asking about it, not
 * by reading a log — because there was no log to read.
 *
 * So warnings and errors are also kept here: a small ring in memory for
 * `/diag`, and the same ring on disk for when the bot itself is too broken to
 * answer a command.
 */
import type { Logger } from './harness/types.js';
/** One thing that went wrong. */
export interface Failure {
    readonly at: string;
    readonly level: 'warn' | 'error';
    readonly message: string;
}
/** Construction options. */
export interface FailureLogOptions {
    /** Where to mirror the ring; absent keeps it in memory only. */
    readonly file?: string;
    /** Strips anything secret before it is written down. */
    readonly redact?: (text: string) => string;
    readonly keep?: number;
    readonly flushMs?: number;
    /** Injected so tests need no clock. */
    readonly now?: () => Date;
}
export declare class FailureLog {
    private readonly options;
    private entries;
    private timer;
    private writing;
    constructor(options?: FailureLogOptions);
    /**
     * Record one failure.
     *
     * @param level - how bad it was.
     * @param message - what happened, already joined into one line.
     */
    record(level: 'warn' | 'error', message: string): void;
    /** The failures kept, newest first. */
    recent(): readonly Failure[];
    /** Write now, whatever the batching timer was waiting for. */
    flush(): Promise<void>;
    /** Stop batching — the plugin is unloading. */
    dispose(): void;
    /** Arm the batching timer, unless one is already armed. */
    private schedule;
    /** Mirror the ring to disk, one write at a time. */
    private persist;
}
/**
 * A logger that also records what it warns and errors about.
 *
 * Wrapping rather than replacing: whatever sink the deployment composed still
 * gets everything, and this only adds a copy of the parts worth looking back
 * at. Debug and info are deliberately not kept — a ring of twenty filled with
 * routine chatter would push out the one line that mattered.
 *
 * @param base - the harness logger.
 * @param log - the ring to tee into.
 */
export declare function recordingLogger(base: Logger, log: FailureLog): Logger;
//# sourceMappingURL=failures.d.ts.map