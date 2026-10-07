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
import { SILENT_LOGGER } from '../harness/types.js';
import { describeToolCall } from './activity.js';
import { RichReplyStream } from './rich-stream.js';
export class TurnBridge {
    options;
    active = new Map();
    logger;
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /**
     * Consume one session event.
     *
     * @param sessionId - the session the event belongs to.
     * @param event - the event from the harness feed.
     */
    async handle(sessionId, event) {
        try {
            switch (event.type) {
                case 'turn/start':
                    return await this.onTurnStart(sessionId, event);
                case 'assistant/chunk':
                    return await this.onChunk(sessionId, event);
                case 'assistant/message':
                    return this.onMessage(sessionId, event);
                case 'tool/call':
                    return await this.onToolCall(sessionId, event);
                case 'tool/result':
                    return await this.onToolResult(sessionId, event);
                case 'turn/end':
                    return await this.onTurnEnd(sessionId, event);
                default:
                    return;
            }
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] failed to stream a turn', error);
        }
    }
    /** Whether a turn is currently streaming for a session. */
    isStreaming(sessionId) {
        return this.active.has(sessionId);
    }
    /** Close every open stream — the plugin is unloading mid-turn. */
    async dispose() {
        const entries = [...this.active.values()];
        this.active.clear();
        for (const entry of entries)
            entry.release();
        await Promise.all(entries.map((entry) => entry.stream.finish().catch(() => undefined)));
    }
    /** Open a reply for a turn in a Telegram-bound session. */
    async onTurnStart(sessionId, event) {
        const target = this.options.targetOf(sessionId);
        if (!target)
            return;
        // A previous turn that never closed would otherwise leak its stream.
        await this.closeActive(sessionId);
        // Taken before the stream exists, because the gap this covers starts here:
        // a turn can think, or sit in a tool call, long before it writes anything.
        const release = this.options.typing?.hold(target) ?? (() => undefined);
        const stream = new RichReplyStream({
            chat: this.options.chat,
            target,
            canDraft: this.options.canDraft(target),
            // The indicator is a stand-in, so it stops the moment there is something
            // real in its place.
            onVisible: release,
            // Stable for the turn, so Telegram animates one growing preview rather
            // than replacing it. Non-zero is required.
            draftId: draftIdFor(sessionId, event.data.turn),
            ...(this.options.throttleMs !== undefined ? { throttleMs: this.options.throttleMs } : {}),
            ...(this.options.heartbeatMs !== undefined ? { heartbeatMs: this.options.heartbeatMs } : {}),
            logger: this.logger,
        });
        this.active.set(sessionId, { turn: event.data.turn, stream, release });
        await stream.start();
    }
    /** Forward one visible text delta. */
    async onChunk(sessionId, event) {
        const entry = this.active.get(sessionId);
        if (!entry || entry.turn !== event.data.turn)
            return;
        if (event.data.chunk.type !== 'text-delta')
            return;
        await entry.stream.append(event.data.chunk.text ?? '');
    }
    /**
     * Say which tool is running.
     *
     * These events were previously dropped along with the reasoning deltas, on
     * the grounds that neither is an answer. That is true of the content and
     * wrong about the need: during a long tool call it is the only sign the
     * agent is alive.
     */
    async onToolCall(sessionId, event) {
        const entry = this.active.get(sessionId);
        if (!entry || entry.turn !== event.data.turn)
            return;
        await entry.stream.showActivity(describeToolCall(event.data.name, event.data.arguments));
    }
    /** Clear the activity line once the tool has answered. */
    async onToolResult(sessionId, event) {
        const entry = this.active.get(sessionId);
        if (!entry || entry.turn !== event.data.turn)
            return;
        await entry.stream.showActivity(undefined);
    }
    /** Record the authoritative text for the turn. */
    onMessage(sessionId, event) {
        const entry = this.active.get(sessionId);
        if (!entry || entry.turn !== event.data.turn)
            return;
        const text = (event.data.message.content ?? [])
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('');
        if (text !== '')
            entry.finalText = text;
    }
    /** Deliver the finished reply, or say why there is none. */
    async onTurnEnd(sessionId, event) {
        const entry = this.active.get(sessionId);
        if (!entry || entry.turn !== event.data.turn)
            return;
        this.active.delete(sessionId);
        entry.release();
        const reason = event.data.reason;
        if (reason?.kind === 'error') {
            const failure = reason.error ?? { message: 'the turn failed' };
            // Whatever streamed is kept: a turn can fail after saying something
            // useful, and discarding it would lose the only answer there was.
            await entry.stream.fail(new Error(failure.message));
            this.options.onFailure?.(sessionId, failure);
            return;
        }
        await entry.stream.finish(entry.finalText);
    }
    /** Finish a stream left open by a turn that never ended. */
    async closeActive(sessionId) {
        const entry = this.active.get(sessionId);
        if (!entry)
            return;
        this.active.delete(sessionId);
        entry.release();
        await entry.stream.finish(entry.finalText).catch(() => undefined);
    }
}
/**
 * A draft id for one turn of one session.
 *
 * Telegram animates frames sharing an id, so it must be stable across a turn
 * and different between turns — otherwise a new reply would animate out of the
 * previous one. Derived rather than counted so a restart mid-conversation
 * cannot collide with an id already in flight.
 */
function draftIdFor(sessionId, turn) {
    let hash = 0;
    for (let index = 0; index < sessionId.length; index += 1) {
        hash = (hash * 31 + sessionId.charCodeAt(index)) | 0;
    }
    // Non-zero and inside the safe integer range Telegram accepts.
    return Math.abs(hash % 1_000_000_000) * 1000 + (turn % 1000) + 1;
}
//# sourceMappingURL=turn-bridge.js.map