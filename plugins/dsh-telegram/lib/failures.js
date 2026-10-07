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
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
/** How many to keep. Enough to see a pattern, short enough to read on a phone. */
const KEEP = 20;
/** How long to batch writes for; a burst of failures is one write, not twenty. */
const FLUSH_MS = 2000;
export class FailureLog {
    options;
    entries = [];
    timer;
    writing = Promise.resolve();
    constructor(options = {}) {
        this.options = options;
    }
    /**
     * Record one failure.
     *
     * @param level - how bad it was.
     * @param message - what happened, already joined into one line.
     */
    record(level, message) {
        const clean = (this.options.redact ?? ((text) => text))(message).trim();
        if (clean === '')
            return;
        const at = (this.options.now?.() ?? new Date()).toISOString();
        this.entries = [{ at, level, message: clean }, ...this.entries].slice(0, this.options.keep ?? KEEP);
        this.schedule();
    }
    /** The failures kept, newest first. */
    recent() {
        return this.entries;
    }
    /** Write now, whatever the batching timer was waiting for. */
    async flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        await this.persist();
    }
    /** Stop batching — the plugin is unloading. */
    dispose() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = undefined;
    }
    /** Arm the batching timer, unless one is already armed. */
    schedule() {
        if (this.options.file === undefined || this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.persist();
        }, this.options.flushMs ?? FLUSH_MS);
        // Never a reason to hold the process open: this is decoration on the way out.
        this.timer.unref?.();
    }
    /** Mirror the ring to disk, one write at a time. */
    async persist() {
        const file = this.options.file;
        if (file === undefined)
            return;
        const snapshot = [...this.entries];
        this.writing = this.writing.then(async () => {
            const temporary = `${file}.${process.pid}.tmp`;
            try {
                await mkdir(dirname(file), { recursive: true });
                await writeFile(temporary, `${JSON.stringify(snapshot, undefined, 2)}\n`, 'utf8');
                await rename(temporary, file);
            }
            catch {
                // The whole point of this file is to be readable when things are
                // broken; failing to write it must not become another failure.
            }
        });
        await this.writing;
    }
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
export function recordingLogger(base, log) {
    const join = (message, rest) => [message, ...rest.map(describe)].filter((part) => part !== '').join(' ');
    return {
        debug: (message, ...rest) => base.debug(message, ...rest),
        info: (message, ...rest) => base.info(message, ...rest),
        warn: (message, ...rest) => {
            log.record('warn', join(message, rest));
            base.warn(message, ...rest);
        },
        error: (message, ...rest) => {
            log.record('error', join(message, rest));
            base.error(message, ...rest);
        },
    };
}
/** Say what an extra logger argument was, without dumping an object graph. */
function describe(value) {
    if (value === undefined || value === null)
        return '';
    if (value instanceof Error)
        return value.message;
    if (typeof value === 'string')
        return value;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value).slice(0, 200);
        }
        catch {
            return '[unserializable]';
        }
    }
    return String(value);
}
//# sourceMappingURL=failures.js.map