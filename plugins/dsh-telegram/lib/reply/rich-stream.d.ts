/**
 * Streaming one agent turn as a rich message.
 *
 * The agent writes markdown, and since Bot API 10.1 Telegram parses markdown
 * itself — tables, headings, ordered and task lists, fenced code, footnotes,
 * math — so the reply is forwarded almost verbatim rather than approximated
 * in HTML. The message cap rises from 4096 to 32768 characters with it.
 *
 * Telegram offers two ways to show a reply as it is written, and they are not
 * interchangeable:
 *
 * - **Private chats** get `sendRichMessageDraft`: an ephemeral preview that
 *   animates between frames carrying the same draft id. It expires after 30
 *   seconds and is never persisted, so the turn must end with a real send.
 * - **Groups have no draft API at all.** There the finished reply is simply
 *   sent when it is ready.
 *
 * Nothing is sent until there is something worth showing — the first text, or
 * the name of a tool the agent reached for. An ellipsis posted the moment a
 * turn opens says only that a message arrived, which the user already knows,
 * and in a group it is a permanent message saying it. Telegram's own typing
 * indicator covers that stretch far better, and {@link onVisible} is what
 * hands it back once this has something real to show.
 *
 * The draft's expiry is the subtle part: a turn that spends two minutes in a
 * tool call emits no text, so without a heartbeat the preview would vanish and
 * the user would think the bot had died.
 */
import type { ChatTarget } from '../interact/surface.js';
import type { Logger } from '../harness/types.js';
/** Telegram's rich-message character cap. */
export declare const RICH_MESSAGE_LIMIT = 32768;
/** Default gap between frames; Telegram throttles rapid updates to one chat. */
export declare const DEFAULT_THROTTLE_MS = 1200;
/**
 * Whether a conversation can show a reply as it is written.
 *
 * Two independent reasons it cannot, and conflating them is how the operator's
 * switch came to do nothing: streaming may be turned off, or the conversation
 * may be a group, which has no draft API at all. Telegram gives groups and
 * channels negative ids, which is the only signal available before a message
 * arrives.
 *
 * @param chatId - the conversation's Telegram id.
 * @param streamingEnabled - the operator's setting.
 */
export declare function canStreamTo(chatId: string, streamingEnabled: boolean): boolean;
/** The Bot API surface a reply needs. */
export interface RichChat {
    sendRichMessage(options: {
        chatId: string;
        markdown: string;
        threadId?: number;
    }): Promise<{
        messageId: number;
    }>;
    sendRichMessageDraft(options: {
        chatId: string;
        draftId: number;
        markdown: string;
        threadId?: number;
    }): Promise<void>;
}
/** Construction options. */
export interface RichReplyOptions {
    readonly chat: RichChat;
    readonly target: ChatTarget;
    /** Private chats stream through drafts; groups have no draft API. */
    readonly canDraft: boolean;
    /** Stable for the turn: Telegram animates frames sharing a draft id. */
    readonly draftId: number;
    readonly throttleMs?: number;
    readonly limit?: number;
    /**
     * Called once, when this turn first shows something in the chat.
     *
     * Whoever was standing in for it until then — the typing indicator — can
     * stop at that point.
     */
    readonly onVisible?: () => void;
    readonly logger?: Logger;
    /** Injected so a test never waits on a real timer. */
    readonly heartbeatMs?: number;
}
export declare class RichReplyStream {
    private readonly options;
    private readonly chat;
    private readonly target;
    private readonly throttleMs;
    private readonly limit;
    private readonly heartbeatMs;
    private readonly logger;
    /** Raw markdown received so far. */
    private buffer;
    /** What the last frame showed, so an unchanged frame is skipped. */
    private shown;
    /**
     * What the agent is doing, shown above the text while it works.
     *
     * Draft-only: Telegram accepts the thinking block in a draft and nowhere
     * else, and the finished reply should carry the answer, not the scaffolding
     * that produced it.
     */
    private activity;
    private started;
    private finished;
    private timer;
    /** Whether anything has appeared in the chat for this turn yet. */
    private visible;
    private heartbeat;
    private lastFrame;
    private queue;
    constructor(options: RichReplyOptions);
    /**
     * Open the turn.
     *
     * Deliberately sends nothing. Until the agent writes a word or names a tool
     * there is nothing to show that the typing indicator is not already showing
     * better, and a message posted here would be an ellipsis the user has to
     * look at for the rest of the turn.
     */
    start(): Promise<void>;
    /**
     * Say what the agent is doing, above whatever text has arrived.
     *
     * @param activity - an escaped one-line description, or undefined to clear.
     */
    showActivity(activity: string | undefined): Promise<void>;
    /**
     * Add streamed markdown.
     *
     * @param delta - the new fragment.
     */
    append(delta: string): Promise<void>;
    /**
     * Close the turn, persisting the reply.
     *
     * @param finalText - authoritative full text when the caller has one.
     */
    finish(finalText?: string): Promise<void>;
    /**
     * Close the turn on an error, keeping whatever text had already streamed.
     *
     * @param error - the failure to show under the partial answer.
     */
    fail(error: unknown): Promise<void>;
    /** Write the finished reply where it will survive the draft's expiry. */
    private persist;
    /** Post one finished chunk. */
    private send;
    /** Show one draft frame, remembering it so the heartbeat can repeat it. */
    private draft;
    /** Report, once, that this turn now shows something in the chat. */
    private becameVisible;
    /** Flush now, or arm a timer for the rest of the throttle window. */
    private schedule;
    /** Send the current buffer as a draft frame, if anything moved. */
    private frame;
    /**
     * Keep the preview alive through a silent stretch.
     *
     * A draft lapses 30 seconds after its last frame, and a turn can spend far
     * longer inside one tool call without emitting a character.
     */
    private armHeartbeat;
    /** Re-send the frame already showing, to hold it past the draft's expiry. */
    private repeat;
    /** Run one send after the previous one, containing its failures. */
    private enqueue;
    /** Disarm the throttle and the heartbeat. */
    private stopTimers;
}
//# sourceMappingURL=rich-stream.d.ts.map