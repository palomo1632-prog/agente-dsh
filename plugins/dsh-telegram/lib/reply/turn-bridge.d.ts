/**
 * Turning the harness's session-event feed into a live Telegram reply.
 *
 * The harness publishes a durable log — `turn/start`, a run of
 * `assistant/chunk` deltas, `assistant/message`, `turn/end` — and every
 * consumer reads the same feed. This bridge subscribes for Telegram-bound
 * sessions only and drives one {@link ReplyStream} per open turn.
 *
 * Only visible model text is forwarded. Reasoning deltas and tool-call deltas
 * stay out of the chat: the first is the model thinking aloud, the second is
 * an argument fragment, and neither is an answer to the person waiting.
 *
 * `assistant/message` is treated as authoritative over the accumulated deltas.
 * A turn cancelled mid-stream still emits it with `interrupted: true`, and it
 * is the only place the finished text is guaranteed complete.
 */
import type { ChatTarget } from '../interact/surface.js';
import type { Logger } from '../harness/types.js';
import type { RichChat } from './rich-stream.js';
/** The session-event shapes this bridge reads. */
export type SessionEvent = {
    readonly type: 'turn/start';
    readonly data: {
        readonly turn: number;
    };
} | {
    readonly type: 'assistant/chunk';
    readonly data: {
        readonly turn: number;
        readonly chunk: {
            readonly type: string;
            readonly text?: string;
        };
    };
} | {
    readonly type: 'assistant/message';
    readonly data: {
        readonly turn: number;
        readonly message: {
            readonly content?: readonly {
                type: string;
                text?: string;
            }[];
        };
    };
} | {
    readonly type: 'tool/call';
    readonly data: {
        readonly turn: number;
        readonly name: string;
        readonly arguments?: string;
    };
} | {
    readonly type: 'tool/result';
    readonly data: {
        readonly turn: number;
    };
} | {
    readonly type: 'turn/end';
    readonly data: {
        readonly turn: number;
        readonly reason?: {
            readonly kind: string;
            readonly error?: {
                message: string;
                code?: string;
            };
        };
    };
} | {
    readonly type: string;
    readonly data?: unknown;
};
/** Construction options. */
export interface TurnBridgeOptions {
    readonly chat: RichChat;
    /** Resolve a session id to its chat, or undefined when it is not a Telegram one. */
    readonly targetOf: (sessionId: string) => ChatTarget | undefined;
    /**
     * Whether a conversation can stream through drafts. Only private chats can:
     * `sendRichMessageDraft` takes a private chat id and nothing else.
     */
    readonly canDraft: (target: ChatTarget) => boolean;
    readonly throttleMs?: number;
    readonly heartbeatMs?: number;
    /**
     * Called when a turn ends in failure.
     *
     * A failed turn produced no reply, so without this the conversation simply
     * goes quiet — which reads as a broken bot rather than as a refused request.
     */
    readonly onFailure?: (sessionId: string, failure: {
        message: string;
        code?: string;
    }) => void;
    /**
     * Keeps Telegram's own indicator alive from the moment a turn opens until it
     * has something to show. Absent leaves the chat quiet until the reply lands.
     */
    readonly typing?: {
        hold(target: ChatTarget): () => void;
    };
    readonly logger?: Logger;
}
export declare class TurnBridge {
    private readonly options;
    private readonly active;
    private readonly logger;
    constructor(options: TurnBridgeOptions);
    /**
     * Consume one session event.
     *
     * @param sessionId - the session the event belongs to.
     * @param event - the event from the harness feed.
     */
    handle(sessionId: string, event: SessionEvent): Promise<void>;
    /** Whether a turn is currently streaming for a session. */
    isStreaming(sessionId: string): boolean;
    /** Close every open stream — the plugin is unloading mid-turn. */
    dispose(): Promise<void>;
    /** Open a reply for a turn in a Telegram-bound session. */
    private onTurnStart;
    /** Forward one visible text delta. */
    private onChunk;
    /**
     * Say which tool is running.
     *
     * These events were previously dropped along with the reasoning deltas, on
     * the grounds that neither is an answer. That is true of the content and
     * wrong about the need: during a long tool call it is the only sign the
     * agent is alive.
     */
    private onToolCall;
    /** Clear the activity line once the tool has answered. */
    private onToolResult;
    /** Record the authoritative text for the turn. */
    private onMessage;
    /** Deliver the finished reply, or say why there is none. */
    private onTurnEnd;
    /** Finish a stream left open by a turn that never ended. */
    private closeActive;
}
//# sourceMappingURL=turn-bridge.d.ts.map