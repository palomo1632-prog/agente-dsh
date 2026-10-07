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
import type { Logger } from '../harness/types.js';
import type { TelegramUpdate } from './types.js';
/** Where updates come from — narrowed so tests need no Bot API client. */
export interface UpdateSource {
    getUpdates(offset: number, timeoutSeconds: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
}
/** Construction options. */
export interface PollerOptions {
    readonly source: UpdateSource;
    /** Handles one update; may throw, which leaves the update unacknowledged. */
    readonly onUpdate: (update: TelegramUpdate) => Promise<void>;
    /** Seconds Telegram holds an empty poll open. */
    readonly longPollSeconds?: number;
    /** First reconnect delay; doubles up to `maxDelayMs`. */
    readonly baseDelayMs?: number;
    readonly maxDelayMs?: number;
    /** Called the first time a poll succeeds after a failure. */
    readonly onConnected?: () => void;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    readonly logger?: Logger;
}
export declare class UpdatePoller {
    private readonly options;
    private readonly logger;
    private readonly sleep;
    private offset;
    private connected;
    constructor(options: PollerOptions);
    /** The next offset that will be acknowledged; exposed for tests and status. */
    get acknowledged(): number;
    /**
     * Poll until the signal aborts.
     *
     * @param signal - stops the loop; an in-flight poll is aborted with it.
     */
    run(signal: AbortSignal): Promise<void>;
    /**
     * Hand each update to the handler, acknowledging only after it returns.
     * A throw stops the batch so the failed update is redelivered.
     */
    private dispatch;
    /** Exponential backoff, capped so a long outage still retries regularly. */
    private backoff;
}
//# sourceMappingURL=poller.d.ts.map