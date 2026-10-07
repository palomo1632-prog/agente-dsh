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
import { SILENT_LOGGER } from '../harness/types.js';
import { splitMarkdown } from './split-markdown.js';
import { thinkingBlock } from './activity.js';
/** Telegram's rich-message character cap. */
export const RICH_MESSAGE_LIMIT = 32_768;
/** Default gap between frames; Telegram throttles rapid updates to one chat. */
export const DEFAULT_THROTTLE_MS = 1200;
/**
 * How often to re-send an unchanged draft.
 *
 * Comfortably inside the 30-second expiry, so a long silent tool call cannot
 * let the preview lapse.
 */
const HEARTBEAT_MS = 20_000;
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
export function canStreamTo(chatId, streamingEnabled) {
    return streamingEnabled && !chatId.startsWith('-');
}
export class RichReplyStream {
    options;
    chat;
    target;
    throttleMs;
    limit;
    heartbeatMs;
    logger;
    /** Raw markdown received so far. */
    buffer = '';
    /** What the last frame showed, so an unchanged frame is skipped. */
    shown = '';
    /**
     * What the agent is doing, shown above the text while it works.
     *
     * Draft-only: Telegram accepts the thinking block in a draft and nowhere
     * else, and the finished reply should carry the answer, not the scaffolding
     * that produced it.
     */
    activity;
    started = false;
    finished = false;
    timer;
    /** Whether anything has appeared in the chat for this turn yet. */
    visible = false;
    heartbeat;
    lastFrame = 0;
    queue = Promise.resolve();
    constructor(options) {
        this.options = options;
        this.chat = options.chat;
        this.target = options.target;
        this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
        this.limit = options.limit ?? RICH_MESSAGE_LIMIT;
        this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /**
     * Open the turn.
     *
     * Deliberately sends nothing. Until the agent writes a word or names a tool
     * there is nothing to show that the typing indicator is not already showing
     * better, and a message posted here would be an ellipsis the user has to
     * look at for the rest of the turn.
     */
    async start() {
        if (this.started)
            return;
        this.started = true;
    }
    /**
     * Say what the agent is doing, above whatever text has arrived.
     *
     * @param activity - an escaped one-line description, or undefined to clear.
     */
    async showActivity(activity) {
        if (this.finished || !this.options.canDraft)
            return;
        if (this.activity === activity)
            return;
        this.activity = activity;
        if (!this.started)
            return await this.start();
        await this.schedule();
    }
    /**
     * Add streamed markdown.
     *
     * @param delta - the new fragment.
     */
    async append(delta) {
        if (this.finished || delta === '')
            return;
        if (!this.started)
            await this.start();
        this.buffer += delta;
        // Only a draft can show progress; a group waits for the finished reply.
        if (this.options.canDraft)
            await this.schedule();
    }
    /**
     * Close the turn, persisting the reply.
     *
     * @param finalText - authoritative full text when the caller has one.
     */
    async finish(finalText) {
        if (this.finished)
            return;
        if (finalText !== undefined)
            this.buffer = finalText;
        if (!this.started && this.buffer === '')
            return;
        if (!this.started)
            await this.start();
        this.finished = true;
        this.stopTimers();
        await this.enqueue(() => this.persist(this.buffer));
    }
    /**
     * Close the turn on an error, keeping whatever text had already streamed.
     *
     * @param error - the failure to show under the partial answer.
     */
    async fail(error) {
        if (this.finished)
            return;
        this.finished = true;
        this.stopTimers();
        const reason = error instanceof Error ? error.message : String(error);
        const body = this.buffer === '' ? '' : `${this.buffer}\n\n`;
        await this.enqueue(() => this.persist(`${body}⚠️ ${reason}`));
    }
    /** Write the finished reply where it will survive the draft's expiry. */
    async persist(markdown) {
        const chunks = splitMarkdown(markdown, this.limit);
        if (chunks.length === 0)
            return;
        for (const chunk of chunks)
            await this.send(chunk);
    }
    /** Post one finished chunk. */
    async send(markdown) {
        await this.chat.sendRichMessage({
            chatId: this.target.chatId,
            markdown,
            ...(this.target.threadId !== undefined ? { threadId: this.target.threadId } : {}),
        });
        this.becameVisible();
    }
    /** Show one draft frame, remembering it so the heartbeat can repeat it. */
    async draft(markdown) {
        const thinking = thinkingBlock(this.activity);
        const composed = thinking === '' ? markdown : `${thinking}\n\n${markdown}`;
        // A draft cannot exceed the message cap either; the tail is what the user
        // is watching, and the whole text lands when the turn is persisted.
        const frame = composed.length > this.limit ? composed.slice(-this.limit) : composed;
        await this.chat.sendRichMessageDraft({
            chatId: this.target.chatId,
            draftId: this.options.draftId,
            markdown: frame,
            ...(this.target.threadId !== undefined ? { threadId: this.target.threadId } : {}),
        });
        this.shown = frame;
        // Armed here rather than at start, because until the first frame there is
        // no preview to keep alive.
        this.armHeartbeat();
        this.becameVisible();
    }
    /** Report, once, that this turn now shows something in the chat. */
    becameVisible() {
        if (this.visible)
            return;
        this.visible = true;
        this.options.onVisible?.();
    }
    /** Flush now, or arm a timer for the rest of the throttle window. */
    async schedule() {
        if (this.throttleMs === 0)
            return await this.enqueue(() => this.frame());
        const due = this.lastFrame + this.throttleMs - Date.now();
        if (due <= 0) {
            this.lastFrame = Date.now();
            return await this.enqueue(() => this.frame());
        }
        if (this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.lastFrame = Date.now();
            void this.enqueue(() => this.frame());
        }, due);
    }
    /** Send the current buffer as a draft frame, if anything moved. */
    async frame() {
        if (this.finished)
            return;
        // The activity line alone is worth a frame: during a long tool call it is
        // the only thing that changes, and it is the whole point of showing it.
        // With neither there is nothing to draw, and Telegram refuses an empty
        // draft anyway — so the previous frame stays, which is what the reader
        // was looking at.
        if (this.buffer === '' && this.activity === undefined)
            return;
        await this.draft(this.buffer);
    }
    /**
     * Keep the preview alive through a silent stretch.
     *
     * A draft lapses 30 seconds after its last frame, and a turn can spend far
     * longer inside one tool call without emitting a character.
     */
    armHeartbeat() {
        if (this.heartbeat || this.heartbeatMs <= 0)
            return;
        this.heartbeat = setInterval(() => {
            if (this.finished || this.shown === '')
                return;
            // Re-sends exactly what is on screen. Keeping a preview alive means
            // repeating it, not replacing it with something that says less.
            void this.enqueue(() => this.repeat());
        }, this.heartbeatMs);
    }
    /** Re-send the frame already showing, to hold it past the draft's expiry. */
    async repeat() {
        await this.chat.sendRichMessageDraft({
            chatId: this.target.chatId,
            draftId: this.options.draftId,
            markdown: this.shown,
            ...(this.target.threadId !== undefined ? { threadId: this.target.threadId } : {}),
        });
    }
    /** Run one send after the previous one, containing its failures. */
    enqueue(task) {
        this.queue = this.queue.then(task).catch((error) => {
            this.logger.warn('[dsh-telegram] reply delivery failed', error);
        });
        return this.queue;
    }
    /** Disarm the throttle and the heartbeat. */
    stopTimers() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = undefined;
        if (this.heartbeat)
            clearInterval(this.heartbeat);
        this.heartbeat = undefined;
    }
}
//# sourceMappingURL=rich-stream.js.map