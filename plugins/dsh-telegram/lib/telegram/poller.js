/**
 * The long-poll receive loop.
 *
 * Telegram's `getUpdates` offset is the delivery guarantee: an update is
 * redelivered until an offset past it is acknowledged. So the offset advances
 * only after the handler for that update returns. A handler that throws leaves
 * the offset where it is and the update comes back on the next poll — which is
 * why the router above it never throws for ordinary failures, and only a real
 * fault gets a retry.
 *
 * Reconnection is the loop's other job. A laptop that sleeps, a network that
 * drops, a Telegram hiccup — each surfaces as a rejected poll, and the bot has
 * to come back on its own rather than going quietly silent.
 */
import { SILENT_LOGGER } from '../harness/types.js';
export class UpdatePoller {
    options;
    logger;
    sleep;
    offset = 0;
    connected = false;
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
        this.sleep = options.sleep ?? defaultSleep;
    }
    /** The next offset that will be acknowledged; exposed for tests and status. */
    get acknowledged() {
        return this.offset;
    }
    /**
     * Poll until the signal aborts.
     *
     * @param signal - stops the loop; an in-flight poll is aborted with it.
     */
    async run(signal) {
        let attempt = 0;
        while (!signal.aborted) {
            try {
                const updates = await this.options.source.getUpdates(this.offset, this.options.longPollSeconds ?? 25, signal);
                attempt = 0;
                if (!this.connected) {
                    this.connected = true;
                    this.options.onConnected?.();
                }
                await this.dispatch(updates, signal);
            }
            catch (error) {
                if (signal.aborted)
                    return;
                this.connected = false;
                attempt += 1;
                const delay = this.backoff(attempt);
                this.logger.warn(`[dsh-telegram] poll failed; retrying in ${delay}ms`, error);
                await this.sleep(delay, signal);
            }
        }
    }
    /**
     * Hand each update to the handler, acknowledging only after it returns.
     * A throw stops the batch so the failed update is redelivered.
     */
    async dispatch(updates, signal) {
        for (const update of updates) {
            if (signal.aborted)
                return;
            await this.options.onUpdate(update);
            this.offset = Math.max(this.offset, update.update_id + 1);
        }
    }
    /** Exponential backoff, capped so a long outage still retries regularly. */
    backoff(attempt) {
        const base = this.options.baseDelayMs ?? 1000;
        const max = this.options.maxDelayMs ?? 30_000;
        return Math.min(base * 2 ** Math.min(attempt - 1, 8), max);
    }
}
/** Cancellable sleep used between reconnect attempts. */
function defaultSleep(ms, signal) {
    return new Promise((resolve) => {
        if (signal?.aborted)
            return resolve();
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
//# sourceMappingURL=poller.js.map