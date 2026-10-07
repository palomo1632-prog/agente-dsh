/**
 * Picking up a conversation that `/new` left behind.
 *
 * The harness keeps every session's log, but the binding naming the current
 * one is replaced, so from a phone `/new` is a one-way door: someone who
 * starts a fresh conversation to ask one quick thing loses the one they were
 * in the middle of.
 *
 * Offered as buttons rather than as `/resume 3`, for the same reason the
 * recovery offer is: the list is already on screen, and asking someone to read
 * an index off it and type a number back is asking them to do a computer's
 * job. It also means there is nothing to mistype.
 */
import type { ChatSurface, ChatTarget } from '../interact/surface.js';
import type { PendingRegistry } from '../interact/pending.js';
import type { Logger } from '../harness/types.js';
import type { ChatHistory } from './history.js';
/** Everything the picker needs from the rest of the plugin. */
export interface SessionPickerOptions {
    readonly surface: ChatSurface;
    readonly pending: PendingRegistry<unknown>;
    readonly history: ChatHistory;
    /** The session this conversation is on now, so it is not offered to itself. */
    readonly currentSession: (target: ChatTarget) => string | undefined;
    /** Point the conversation at an existing session. */
    readonly adopt: (target: ChatTarget, sessionId: string) => Promise<void>;
    readonly logger?: Logger;
}
export declare class SessionPicker {
    private readonly options;
    private readonly logger;
    /** One outstanding keyboard per chat or group topic. */
    private readonly active;
    constructor(options: SessionPickerOptions);
    /**
     * Offer this chat's earlier conversations.
     *
     * @param target - the conversation asking.
     */
    offer(target: ChatTarget): Promise<void>;
    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open picker.
     */
    handleCallback(data: string | undefined): boolean;
    /** Post one message, swallowing delivery failures. */
    private say;
}
//# sourceMappingURL=picker.d.ts.map