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
import { randomUUID } from 'node:crypto';
export class PendingRegistry {
    entries = new Map();
    /**
     * Park a new waiter.
     *
     * @param options - cancellation signal and cleanup hook.
     * @returns the routing token and the promise the caller awaits.
     */
    open(options) {
        const token = this.mintToken();
        let settle = () => undefined;
        const promise = new Promise((resolve) => {
            settle = resolve;
        });
        const onAbort = () => this.cancel(token);
        const entry = {
            settle,
            detach: () => options.signal?.removeEventListener('abort', onAbort),
            onCancel: options.onCancel,
        };
        this.entries.set(token, entry);
        if (options.signal?.aborted)
            this.cancel(token);
        else
            options.signal?.addEventListener('abort', onAbort, { once: true });
        return { token, promise };
    }
    /**
     * Deliver an answer.
     *
     * @param token - the token from the pressed button.
     * @param value - the answer to resolve with.
     * @returns whether this call was the one that settled the waiter.
     */
    settle(token, value) {
        const entry = this.entries.get(token);
        if (!entry)
            return false;
        this.entries.delete(token);
        entry.detach();
        entry.settle(value);
        return true;
    }
    /** Whether a token still routes to an open waiter. */
    has(token) {
        return this.entries.has(token);
    }
    /** Cancel one waiter, resolving it with `undefined` and running its hook. */
    cancel(token) {
        const entry = this.entries.get(token);
        if (!entry)
            return false;
        this.entries.delete(token);
        entry.detach();
        entry.settle(undefined);
        entry.onCancel?.();
        return true;
    }
    /** Cancel every open waiter — the plugin is unloading. */
    dispose() {
        for (const token of [...this.entries.keys()])
            this.cancel(token);
    }
    /** A short, collision-free token drawn from a UUID's entropy. */
    mintToken() {
        for (;;) {
            const token = randomUUID().replace(/-/g, '').slice(0, 12);
            if (!this.entries.has(token))
                return token;
        }
    }
}
//# sourceMappingURL=pending.js.map