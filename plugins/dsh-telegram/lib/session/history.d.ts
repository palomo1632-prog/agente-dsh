/**
 * The conversations a chat has had, so one can be picked up again.
 *
 * `/new` is otherwise a one-way door: the harness keeps every session's log,
 * but the binding that named it is replaced, and from a phone there is no
 * other way back. Someone who starts a fresh conversation to ask one quick
 * thing loses the one they were in the middle of.
 *
 * Kept by this plugin rather than read from the harness's own session index,
 * because the question is "which conversations happened in THIS chat" — a
 * Telegram fact the harness does not record. The index would also mix in every
 * session from the web UI, which is not what anyone means by "my
 * conversations" when they ask from Telegram.
 */
import type { ChatTarget } from '../interact/surface.js';
/** One past conversation. */
export interface PastSession {
    readonly sessionId: string;
    readonly startedAt: number;
    readonly cwd: string;
    /** The opening words, so the list is readable at a glance. */
    readonly label?: string;
}
export declare class ChatHistory {
    private readonly file;
    private entries;
    private constructor();
    /**
     * Load the history, or start empty when there is nothing readable yet.
     *
     * @param file - absolute path to the JSON document.
     */
    static open(file: string): Promise<ChatHistory>;
    /** What this chat has talked to, newest first. */
    forChat(target: ChatTarget): readonly PastSession[];
    /**
     * Record a conversation, or refresh the label of one already known.
     *
     * @param target - the conversation's chat.
     * @param session - the session, and what it opened with.
     */
    remember(target: ChatTarget, session: PastSession): Promise<void>;
    /** Forget one conversation — its log is gone, or it could not be resumed. */
    forget(target: ChatTarget, sessionId: string): Promise<void>;
    /** Write the document atomically, so a crash cannot leave a half file. */
    private persist;
}
/** Cut a label to length, marking that it was cut. */
export declare function clip(text: string): string;
//# sourceMappingURL=history.d.ts.map