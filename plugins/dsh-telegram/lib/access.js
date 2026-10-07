/**
 * Who is allowed to drive the agent.
 *
 * This is the plugin's most security-sensitive decision. A Telegram bot is
 * reachable by anyone who knows its handle, and the agent behind it can run
 * shell commands on the operator's machine. So the default is closed: an
 * unconfigured bot answers nobody until it is claimed once, with a code that
 * is printed to the operator's own console and never sent over Telegram.
 *
 * Ownership is durable and single-shot. Once claimed, a later claim — even
 * with the right code — is refused, so a code that leaks after the fact grants
 * nothing.
 */
import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export class AccessPolicy {
    file;
    options;
    ownerId;
    constructor(file, options) {
        this.file = file;
        this.options = options;
    }
    /**
     * Load recorded ownership, or start unowned.
     *
     * @param file - absolute path to the ownership record.
     * @param options - allowlist and this process's claim code.
     */
    static async open(file, options) {
        const policy = new AccessPolicy(file, options);
        policy.ownerId = await readOwner(file);
        await policy.publishClaimCode();
        return policy;
    }
    /**
     * Decide whether a user may drive the agent.
     *
     * @param userId - the Telegram user id from the update.
     */
    check(userId) {
        if (this.options.allowFrom.includes(userId))
            return 'allowed';
        if (this.ownerId === userId)
            return 'allowed';
        if (this.ownerId !== undefined)
            return 'denied';
        if (this.options.allowFrom.length > 0)
            return 'denied';
        return 'unclaimed';
    }
    /** The recorded owner, when the bot has been claimed. */
    owner() {
        return this.ownerId;
    }
    /**
     * Take ownership of an unowned bot.
     *
     * @param userId - the claiming Telegram user.
     * @param code - the code they supplied, from an untrusted message.
     * @returns whether ownership was transferred.
     */
    async claim(userId, code) {
        if (this.ownerId !== undefined)
            return false;
        if (this.options.allowFrom.length > 0)
            return false;
        if (!matches(code, this.options.claimCode))
            return false;
        this.ownerId = userId;
        await this.persist();
        await this.retractClaimCode();
        return true;
    }
    /**
     * Drop the claim code where the operator can read it, while it is still
     * needed. Owner-only permissions: anyone who can read it can take the bot.
     */
    async publishClaimCode() {
        const path = this.options.claimCodeFile;
        if (path === undefined)
            return;
        if (this.ownerId !== undefined || this.options.allowFrom.length > 0) {
            return await this.retractClaimCode();
        }
        try {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, `Send this to your bot to take ownership of it:\n\n    /claim ${this.options.claimCode}\n\n` +
                `It changes on every restart, and this file disappears once the bot is claimed.\n`, { encoding: 'utf8', mode: 0o600 });
        }
        catch {
            // Best effort: the log still carries the code.
        }
    }
    /** Remove the published code; it grants nothing now and should not linger. */
    async retractClaimCode() {
        const path = this.options.claimCodeFile;
        if (path === undefined)
            return;
        await rm(path, { force: true }).catch(() => undefined);
    }
    /** Record ownership atomically. */
    async persist() {
        const temporary = `${this.file}.${process.pid}.tmp`;
        const document = { ownerId: this.ownerId, claimedAt: Date.now() };
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(temporary, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');
        await rename(temporary, this.file);
    }
}
/**
 * Constant-time comparison of a supplied code against the expected one.
 * Lengths are compared through the same path so a wrong length leaks no more
 * than a wrong byte does.
 */
function matches(supplied, expected) {
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
        // Still do the work, so timing does not distinguish "wrong length".
        timingSafeEqual(b, b);
        return false;
    }
    return timingSafeEqual(a, b);
}
/** Read the recorded owner, treating anything unreadable as unowned. */
async function readOwner(file) {
    try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        return typeof parsed.ownerId === 'number' ? parsed.ownerId : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=access.js.map