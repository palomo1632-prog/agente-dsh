/**
 * Which harness session each Telegram conversation is talking to.
 *
 * This mapping has to outlive the process: a user who messages the bot on
 * Monday and again on Tuesday expects the same conversation, and the harness
 * can resume the session from its log — but only if we still remember which
 * session id belonged to that chat.
 *
 * The reverse direction matters just as much. When the agent asks a question,
 * all we have is a session id, and we need the chat to ask in. So both
 * directions are indexed, and every mutation keeps them consistent.
 *
 * A group's forum topics are separate conversations: the same chat id with a
 * different thread id gets its own session, because that is how the people in
 * the group are already using it.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export class BindingStore {
    file;
    /** Keyed by conversation key; the durable form. */
    bindings = new Map();
    /** Session id → conversation key; derived, rebuilt on every mutation. */
    bySession = new Map();
    constructor(file) {
        this.file = file;
    }
    /**
     * Load the store, or start empty when there is nothing readable yet.
     *
     * A corrupt file is not fatal: losing the mapping costs the user their
     * conversation continuity, while refusing to start costs them the bot.
     *
     * @param file - absolute path to the JSON document.
     */
    static async open(file) {
        const store = new BindingStore(file);
        store.replaceAll(await readBindings(file));
        return store;
    }
    /** The binding for a conversation, if it has one. */
    forChat(target) {
        return this.bindings.get(keyOf(target));
    }
    /** The conversation a session belongs to, if any. */
    forSession(sessionId) {
        const key = this.bySession.get(sessionId);
        const binding = key === undefined ? undefined : this.bindings.get(key);
        if (!binding)
            return undefined;
        return {
            chatId: binding.chatId,
            ...(binding.threadId !== undefined ? { threadId: binding.threadId } : {}),
        };
    }
    /** Every remembered conversation. */
    list() {
        return [...this.bindings.values()];
    }
    /**
     * Bind a conversation to a session, replacing any previous binding.
     *
     * @param target - the conversation.
     * @param sessionId - the harness session it now talks to.
     */
    async bind(target, sessionId) {
        const key = keyOf(target);
        const now = Date.now();
        const previous = this.bindings.get(key);
        const next = new Map(this.bindings);
        next.set(key, {
            chatId: target.chatId,
            ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
            sessionId,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
        });
        this.replaceAll(next);
        await this.persist();
    }
    /**
     * Record that this conversation's session log now carries an image.
     *
     * @param target - the conversation.
     */
    async markImages(target) {
        const key = keyOf(target);
        const binding = this.bindings.get(key);
        if (!binding || binding.hasImages)
            return;
        const next = new Map(this.bindings);
        next.set(key, { ...binding, hasImages: true, updatedAt: Date.now() });
        this.replaceAll(next);
        await this.persist();
    }
    /**
     * Forget a conversation's binding, so its next message starts fresh.
     *
     * @param target - the conversation to forget.
     */
    async unbind(target) {
        const next = new Map(this.bindings);
        if (!next.delete(keyOf(target)))
            return;
        this.replaceAll(next);
        await this.persist();
    }
    /** Swap in a new binding set and rebuild the session index from it. */
    replaceAll(bindings) {
        this.bindings = new Map(bindings);
        this.bySession = new Map([...bindings].map(([key, binding]) => [binding.sessionId, key]));
    }
    /** Write the document atomically, so a crash cannot leave a half file. */
    async persist() {
        const document = Object.fromEntries(this.bindings);
        const temporary = `${this.file}.${process.pid}.tmp`;
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(temporary, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');
        await rename(temporary, this.file);
    }
}
/** The durable key for one conversation; a forum topic is its own conversation. */
function keyOf(target) {
    return target.threadId === undefined ? target.chatId : `${target.chatId}#${target.threadId}`;
}
/** Read and validate the document, keeping only entries with a usable shape. */
async function readBindings(file) {
    const bindings = new Map();
    let raw;
    try {
        raw = await readFile(file, 'utf8');
    }
    catch {
        return bindings;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return bindings;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return bindings;
    for (const [key, value] of Object.entries(parsed)) {
        const binding = asBinding(value);
        if (binding)
            bindings.set(key, binding);
    }
    return bindings;
}
/** Narrow one stored entry, or reject it. */
function asBinding(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const record = value;
    if (typeof record.chatId !== 'string' || typeof record.sessionId !== 'string')
        return undefined;
    if (record.threadId !== undefined && typeof record.threadId !== 'number')
        return undefined;
    return {
        chatId: record.chatId,
        ...(typeof record.threadId === 'number' ? { threadId: record.threadId } : {}),
        sessionId: record.sessionId,
        createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
        updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
        ...(record.hasImages === true ? { hasImages: true } : {}),
    };
}
//# sourceMappingURL=bindings.js.map