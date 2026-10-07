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
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
/** Publishes the connection's state where a person can read it. */
export class StatusFile {
    file;
    redact;
    constructor(file, 
    /** Strips the bot token from any text bound for the file. */
    redact = (text) => text) {
        this.file = file;
        this.redact = redact;
    }
    /**
     * Publish a state.
     *
     * Failures are swallowed: a plugin must not fall over because it could not
     * write its own diagnostics.
     *
     * @param state - what the connection is doing.
     * @param extra - the bot username and reason, where they apply.
     */
    async publish(state, extra = {}) {
        const snapshot = {
            state,
            ...(extra.bot !== undefined ? { bot: extra.bot } : {}),
            ...(extra.detail !== undefined ? { detail: this.redact(extra.detail) } : {}),
            updatedAt: new Date().toISOString(),
        };
        try {
            const temporary = `${this.file}.${process.pid}.tmp`;
            await mkdir(dirname(this.file), { recursive: true });
            await writeFile(temporary, `${JSON.stringify(snapshot, undefined, 2)}\n`, 'utf8');
            await rename(temporary, this.file);
        }
        catch {
            // Diagnostics must never be the thing that breaks.
        }
    }
}
/** Reduce any thrown value to one readable line. */
export function describeError(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
//# sourceMappingURL=diagnostics.js.map