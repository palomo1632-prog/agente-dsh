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
/** The three answers to "may this user talk to the agent?". */
export type AccessDecision = 
/** On the allowlist, or the recorded owner. */
'allowed'
/** Someone else owns this bot, or an allowlist excludes this user. */
 | 'denied'
/** Nobody owns the bot yet; this user may claim it with the code. */
 | 'unclaimed';
/** Construction options. */
export interface AccessPolicyOptions {
    /** Telegram user ids admitted without claiming. Empty enables the claim flow. */
    readonly allowFrom: readonly number[];
    /** The one-time code that transfers ownership; printed to the operator's console. */
    readonly claimCode: string;
    /**
     * Where to also drop the claim code while the bot is unowned.
     *
     * The console is not always readable — a harness started detached, or a
     * profile whose logger has no console sink, swallows it — and a claim code
     * nobody can read makes the bot permanently unusable. The file is written
     * owner-only and removed the moment the bot is claimed.
     */
    readonly claimCodeFile?: string;
}
export declare class AccessPolicy {
    private readonly file;
    private readonly options;
    private ownerId;
    private constructor();
    /**
     * Load recorded ownership, or start unowned.
     *
     * @param file - absolute path to the ownership record.
     * @param options - allowlist and this process's claim code.
     */
    static open(file: string, options: AccessPolicyOptions): Promise<AccessPolicy>;
    /**
     * Decide whether a user may drive the agent.
     *
     * @param userId - the Telegram user id from the update.
     */
    check(userId: number): AccessDecision;
    /** The recorded owner, when the bot has been claimed. */
    owner(): number | undefined;
    /**
     * Take ownership of an unowned bot.
     *
     * @param userId - the claiming Telegram user.
     * @param code - the code they supplied, from an untrusted message.
     * @returns whether ownership was transferred.
     */
    claim(userId: number, code: string): Promise<boolean>;
    /**
     * Drop the claim code where the operator can read it, while it is still
     * needed. Owner-only permissions: anyone who can read it can take the bot.
     */
    private publishClaimCode;
    /** Remove the published code; it grants nothing now and should not linger. */
    private retractClaimCode;
    /** Record ownership atomically. */
    private persist;
}
//# sourceMappingURL=access.d.ts.map