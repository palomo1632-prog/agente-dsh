/**
 * Waiters keyed by a short token.
 *
 * Every interactive prompt this plugin sends — a question, an approval — is a
 * promise the agent is blocked on, parked here until a button press arrives
 * minutes later in a completely separate HTTP request. The token is the only
 * thing that survives that round trip: it travels inside Telegram's
 * `callback_data`, which is capped at 64 bytes and shares that space with a
 * kind prefix and an option index. Hence short tokens rather than UUIDs.
 *
 * Settling is first-claimant-wins. A user can press two buttons before the
 * first press is acknowledged, a signal can abort mid-press, and the plugin
 * can unload underneath both — so the registry removes the entry before
 * resolving, and every later claim is a no-op rather than a double-resolve.
 */
/** A registered waiter: the token to route presses by, and its settlement. */
export interface PendingWaiter<T> {
    /** Short id carried in `callback_data`. */
    readonly token: string;
    /** Resolves with the settled value, or `undefined` when cancelled. */
    readonly promise: Promise<T | undefined>;
}
/** Options for one waiter. */
export interface OpenOptions {
    /** Cancels the waiter when it aborts (the agent gave up, the turn ended). */
    readonly signal?: AbortSignal;
    /** Runs on cancellation only — never after an answer. Used to retire the keyboard. */
    readonly onCancel?: () => void;
}
export declare class PendingRegistry<T> {
    private readonly entries;
    /**
     * Park a new waiter.
     *
     * @param options - cancellation signal and cleanup hook.
     * @returns the routing token and the promise the caller awaits.
     */
    open(options: OpenOptions): PendingWaiter<T>;
    /**
     * Deliver an answer.
     *
     * @param token - the token from the pressed button.
     * @param value - the answer to resolve with.
     * @returns whether this call was the one that settled the waiter.
     */
    settle(token: string, value: T): boolean;
    /** Whether a token still routes to an open waiter. */
    has(token: string): boolean;
    /** Cancel one waiter, resolving it with `undefined` and running its hook. */
    cancel(token: string): boolean;
    /** Cancel every open waiter — the plugin is unloading. */
    dispose(): void;
    /** A short, collision-free token drawn from a UUID's entropy. */
    private mintToken;
}
//# sourceMappingURL=pending.d.ts.map