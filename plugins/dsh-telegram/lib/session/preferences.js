/**
 * One durable string a conversation chose for itself.
 *
 * Two things need this and they are the same shape: the directory a chat works
 * in, and the model it talks to. Both are per conversation, both must outlive
 * `/new` — a preference discarded with the session would silently snap back to
 * the deployment default on the next message — and both must outlive a
 * restart.
 *
 * Kept apart from the session binding for exactly that reason: a binding is
 * one conversation with the agent and dies with `/new`, while a preference
 * belongs to the CHAT.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export class ChatPreferences {
    file;
    accept;
    values = new Map();
    constructor(file, accept) {
        this.file = file;
        this.accept = accept;
    }
    /**
     * Load the store, or start empty when there is nothing readable yet.
     *
     * A corrupt file costs the conversation its preference, which one command
     * restores; refusing to start would cost the whole bot.
     *
     * @param file - absolute path to the JSON document.
     * @param options - how to tell a usable value from one to drop.
     */
    static async open(file, options) {
        const store = new ChatPreferences(file, options.accept);
        store.values = await read(file, options.accept);
        return store;
    }
    /** What this conversation chose, if it chose anything. */
    forChat(target) {
        return this.values.get(keyOf(target));
    }
    /**
     * Remember a conversation's choice.
     *
     * @param target - the conversation.
     * @param value - the value, already checked by the caller.
     */
    async set(target, value) {
        if (!this.accept(value))
            return;
        const next = new Map(this.values);
        next.set(keyOf(target), value);
        this.values = next;
        await this.persist();
    }
    /** Forget it, returning the conversation to the deployment default. */
    async clear(target) {
        const next = new Map(this.values);
        if (!next.delete(keyOf(target)))
            return;
        this.values = next;
        await this.persist();
    }
    /** Write the document atomically, so a crash cannot leave a half file. */
    async persist() {
        const document = Object.fromEntries(this.values);
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
/** Read the document, keeping only entries the caller still accepts. */
async function read(file, accept) {
    const values = new Map();
    let raw;
    try {
        raw = await readFile(file, 'utf8');
    }
    catch {
        return values;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return values;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return values;
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value !== '' && accept(value))
            values.set(key, value);
    }
    return values;
}
//# sourceMappingURL=preferences.js.map