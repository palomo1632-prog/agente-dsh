/**
 * Telegram Bot API client.
 *
 * Speaks the HTTP protocol directly — no SDK — because the surface this plugin
 * needs is a dozen methods wide and an SDK would only add a dependency and a
 * translation layer between us and the error messages that matter.
 *
 * Three behaviours are deliberate and are the reason this client exists rather
 * than a thin fetch wrapper:
 *
 * - **Replies are sent as rich markdown.** Since Bot API 10.1 Telegram parses
 *   markdown itself, so the agent's tables, headings and lists arrive as real
 *   elements. The plugin's own prompts stay on plain HTML: they are short,
 *   built from escaped text, and carry the inline keyboards.
 * - **Rate limits are waited out, not thrown.** A 429 carries `retry_after`;
 *   the client sleeps that long and retries, so a burst of streaming edits
 *   degrades into slower edits rather than a failed turn.
 * - **The token never reaches a log.** It lives in the request path, so every
 *   error message is redacted before it escapes.
 */
/** Attempts for a request that fails with a retryable status. */
const MAX_RETRIES = 3;
/** Backoff for retryable failures that carry no `retry_after`. */
const BACKOFF_MS = [500, 1500, 4000];
/** Statuses worth retrying: rate limit, and Telegram's own transient faults. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/**
 * Methods safe to repeat after a transport failure.
 *
 * A dropped connection leaves no way to know whether the request arrived, so
 * repeating a send could post the same message twice. These are all reads or
 * idempotent, so repeating one costs nothing and rescues the call.
 *
 * This matters most for `getFile`: it runs while the long poll holds its own
 * connection open, so it is the call most likely to need a fresh one, and a
 * single flaky connect was turning a sent screenshot into an error.
 */
const IDEMPOTENT = new Set(['getMe', 'getFile', 'getUpdates', 'deleteWebhook', 'downloadFile']);
/** Deadline for one file download; larger than an API call's, for large files. */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000;
/** A Bot API call that failed, with the token stripped from every field. */
export class TelegramApiError extends Error {
    code;
    description;
    retryAfterSeconds;
    constructor(message, code, description, 
    /** Seconds Telegram asked us to wait, from a 429's `parameters.retry_after`. */
    retryAfterSeconds) {
        super(message);
        this.code = code;
        this.description = description;
        this.retryAfterSeconds = retryAfterSeconds;
        this.name = 'TelegramApiError';
    }
    /** Whether the failure means the bot token itself is not valid. */
    get isAuthFailure() {
        return this.code === 401;
    }
}
export class TelegramApi {
    options;
    fetchImpl;
    sleep;
    downloadTimeoutMs;
    constructor(options) {
        this.options = options;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.sleep = options.sleep ?? defaultSleep;
        this.downloadTimeoutMs = options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
    }
    /** Verify the token and read the bot's own identity. */
    getMe() {
        return this.call('getMe', {});
    }
    /** Drop any webhook so long polling is the only delivery path. */
    async deleteWebhook() {
        await this.call('deleteWebhook', { drop_pending_updates: false });
    }
    /**
     * Long-poll for updates.
     *
     * `allowed_updates` includes `callback_query`, which is what lets a button
     * press reach the agent at all.
     */
    getUpdates(offset, timeoutSeconds, signal) {
        return this.call('getUpdates', {
            offset,
            timeout: timeoutSeconds,
            allowed_updates: ['message', 'callback_query'],
        }, { ...(signal ? { signal } : {}), timeoutMs: timeoutSeconds * 1000 + 5000 });
    }
    /**
     * Send one HTML message, falling back to plain text if Telegram rejects the
     * markup rather than letting the content vanish.
     */
    async sendMessage(options) {
        const body = {
            chat_id: options.chatId,
            text: options.html,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            ...(options.keyboard ? { reply_markup: toReplyMarkup(options.keyboard) } : {}),
            ...(options.replyToMessageId
                ? { reply_parameters: { message_id: options.replyToMessageId } }
                : {}),
            ...(options.threadId !== undefined ? { message_thread_id: options.threadId } : {}),
        };
        const sent = await this.call('sendMessage', body, {
            ...(options.signal ? { signal: options.signal } : {}),
        });
        return { messageId: sent.message_id };
    }
    /**
     * Edit one message in place — the mechanism behind streamed replies.
     *
     * Telegram answers 400 when the new text equals the old, which during
     * streaming is an ordinary and frequent event, so it is reported rather than
     * thrown.
     */
    async editMessageText(options) {
        const body = {
            chat_id: options.chatId,
            message_id: options.messageId,
            text: options.html,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            ...(options.keyboard ? { reply_markup: toReplyMarkup(options.keyboard) } : {}),
        };
        try {
            await this.call('editMessageText', body, {
                ...(options.signal ? { signal: options.signal } : {}),
            });
            return 'edited';
        }
        catch (error) {
            if (isNotModified(error))
                return 'unchanged';
            throw error;
        }
    }
    /**
     * Send one rich message.
     *
     * Telegram parses the Rich Markdown itself, so tables, headings, lists and
     * task lists arrive as real elements rather than as an approximation of
     * them — and the cap is 32768 characters rather than 4096.
     */
    async sendRichMessage(options) {
        const sent = await this.call('sendRichMessage', {
            chat_id: options.chatId,
            rich_message: { markdown: options.markdown },
            ...(options.keyboard ? { reply_markup: toReplyMarkup(options.keyboard) } : {}),
            ...(options.replyToMessageId
                ? { reply_parameters: { message_id: options.replyToMessageId } }
                : {}),
            ...(options.threadId !== undefined ? { message_thread_id: options.threadId } : {}),
        }, { ...(options.signal ? { signal: options.signal } : {}) });
        return { messageId: sent.message_id };
    }
    /**
     * Stream one frame of a partial reply.
     *
     * The draft is a 30-second ephemeral preview, and Telegram animates changes
     * carrying the same `draftId` — so a turn keeps one id throughout and the
     * text grows in place. It must still be persisted with a real send when the
     * turn ends, and it works in private chats only.
     */
    async sendRichMessageDraft(options) {
        await this.call('sendRichMessageDraft', {
            chat_id: options.chatId,
            draft_id: options.draftId,
            rich_message: { markdown: options.markdown },
            ...(options.threadId !== undefined ? { message_thread_id: options.threadId } : {}),
        }, { ...(options.signal ? { signal: options.signal } : {}) });
    }
    /** Replace a message's content with rich markdown. */
    async editRichMessage(options) {
        try {
            await this.call('editMessageText', {
                chat_id: options.chatId,
                message_id: options.messageId,
                rich_message: { markdown: options.markdown },
                ...(options.keyboard ? { reply_markup: toReplyMarkup(options.keyboard) } : {}),
            });
            return 'edited';
        }
        catch (error) {
            if (isNotModified(error))
                return 'unchanged';
            throw error;
        }
    }
    /** Replace or clear a message's inline keyboard, leaving its text alone. */
    async editMessageReplyMarkup(options) {
        try {
            await this.call('editMessageReplyMarkup', {
                chat_id: options.chatId,
                message_id: options.messageId,
                reply_markup: toReplyMarkup(options.keyboard),
            });
        }
        catch (error) {
            if (!isNotModified(error))
                throw error;
        }
    }
    /**
     * Acknowledge a button press. Telegram shows a spinner on the button until
     * this lands, so it is sent before any slow work the press triggers.
     */
    async answerCallbackQuery(id, text) {
        try {
            await this.call('answerCallbackQuery', {
                callback_query_id: id,
                ...(text ? { text } : {}),
            });
        }
        catch {
            // An expired callback id is normal (the user pressed twice, or waited);
            // failing to acknowledge must never abort the work the press started.
        }
    }
    /**
     * Upload one file to a chat.
     *
     * Multipart rather than the JSON path every other call uses, because
     * Telegram takes file bytes no other way. Node builds the body: `FormData`
     * and `Blob` are standard here, so there is no boundary to get wrong.
     *
     * Not retried. A retry would re-upload the whole file, and the failures that
     * matter for one — too large, wrong type — do not pass on a second attempt.
     *
     * @param method - `sendPhoto` or `sendDocument`.
     * @param field - the form field Telegram expects the bytes under.
     * @param options - the chat, the bytes, and what to call them.
     */
    async uploadFile(method, field, options) {
        const form = new FormData();
        form.set('chat_id', options.chatId);
        if (options.caption !== undefined)
            form.set('caption', options.caption);
        if (options.caption !== undefined)
            form.set('parse_mode', 'HTML');
        if (options.threadId !== undefined)
            form.set('message_thread_id', String(options.threadId));
        form.set(field, 
        // Copied into a plain ArrayBuffer: a Uint8Array view may sit on a larger
        // pooled buffer, and Blob would take the whole thing.
        new Blob([options.data.slice().buffer], { type: options.contentType }), options.filename);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.downloadTimeoutMs);
        try {
            const response = await this.fetchImpl(`${this.base()}/bot${this.options.token}/${method}`, {
                method: 'POST',
                body: form,
                signal: controller.signal,
            });
            const envelope = parseEnvelope(await response.text(), method);
            if (!envelope.ok) {
                throw new TelegramApiError(this.redact(`telegram ${method} failed: ${envelope.description ?? `http ${response.status}`}`), envelope.error_code ?? response.status, envelope.description === undefined ? undefined : this.redact(envelope.description));
            }
            return { messageId: envelope.result.message_id };
        }
        catch (error) {
            throw this.normalize(error, method);
        }
        finally {
            clearTimeout(timer);
        }
    }
    /**
     * Publish the command menu Telegram offers when someone types `/`.
     *
     * Without this the bot answers every command correctly and advertises none
     * of them, so they are discoverable only by reading the README. Best-effort:
     * a bot that cannot publish its menu still works, it is only harder to find
     * your way around.
     *
     * @param commands - name and one-line description, in menu order.
     */
    async setMyCommands(commands) {
        try {
            await this.call('setMyCommands', { commands });
        }
        catch {
            // Cosmetic only.
        }
    }
    /** Show a progress indicator in the chat. Best-effort by design. */
    async sendChatAction(chatId, action, threadId) {
        try {
            await this.call('sendChatAction', {
                chat_id: chatId,
                action,
                ...(threadId === undefined ? {} : { message_thread_id: threadId }),
            });
        }
        catch {
            // Cosmetic only.
        }
    }
    /** Resolve a file id to downloadable metadata. */
    getFile(fileId) {
        return this.call('getFile', { file_id: fileId });
    }
    /**
     * Download a resolved file's bytes.
     *
     * The download URL carries the token in its path, and a transport failure
     * quotes the URL it was given — so this fetch is wrapped like every other,
     * or a dropped connection would hand the token to the caller's log.
     */
    async downloadFile(filePath, signal) {
        const url = `${this.base()}/file/bot${this.options.token}/${filePath.replace(/^\/+/, '')}`;
        return this.withRetries('downloadFile', signal, async () => {
            // Its own deadline, and a generous one: without a timeout this waited on
            // the operating system's TCP timeout, which is minutes, and a file may
            // legitimately be 20 MB over a slow link.
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.downloadTimeoutMs);
            const onAbort = () => controller.abort();
            signal?.addEventListener('abort', onAbort, { once: true });
            try {
                const response = await this.fetchImpl(url, { signal: controller.signal });
                if (!response.ok) {
                    throw new TelegramApiError(`telegram file download failed with http ${response.status}`, response.status, undefined);
                }
                return new Uint8Array(await response.arrayBuffer());
            }
            catch (error) {
                throw this.normalize(error, 'downloadFile');
            }
            finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
            }
        });
    }
    /** Base url without a trailing slash. */
    base() {
        return this.options.baseUrl.replace(/\/+$/, '');
    }
    /**
     * One Bot API call, with retries for transient failures.
     *
     * @throws {TelegramApiError} with the token redacted from every field.
     */
    call(method, body, options = {}) {
        return this.withRetries(method, options.signal, () => this.request(method, body, options));
    }
    /**
     * Run one operation, backing off and repeating what is safe to repeat.
     *
     * Shared with the download path rather than living inside `call`: a download
     * is the most retry-worthy request this client makes — a pure read of bytes
     * — and leaving it outside the retry loop is what turned an intermittent
     * connection into a screenshot the agent never saw.
     */
    async withRetries(method, signal, run) {
        let lastError;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
            try {
                return await run();
            }
            catch (error) {
                lastError = error;
                const delay = retryDelay(error, attempt, IDEMPOTENT.has(method));
                if (delay === undefined)
                    throw error;
                await this.sleep(delay, signal);
            }
        }
        throw lastError;
    }
    /** One attempt: build, send, validate, unwrap. */
    async request(method, body, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.options.timeoutMs);
        const onAbort = () => controller.abort();
        options.signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const response = await this.fetchImpl(`${this.base()}/bot${this.options.token}/${method}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(prune(body)),
                signal: controller.signal,
            });
            const envelope = parseEnvelope(await response.text(), method);
            if (!envelope.ok) {
                throw new TelegramApiError(this.redact(`telegram ${method} failed: ${envelope.description ?? `http ${response.status}`}`), envelope.error_code ?? response.status, 
                // Redacted too, though Telegram's own descriptions do not quote the
                // request. `description` is read straight into a log line on an auth
                // failure, and a field that skips this is a field that only has to be
                // wrong once.
                envelope.description === undefined ? undefined : this.redact(envelope.description), envelope.parameters?.retry_after);
            }
            return envelope.result;
        }
        catch (error) {
            throw this.normalize(error, method);
        }
        finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
        }
    }
    /** Wrap any thrown value as a redacted TelegramApiError. */
    normalize(error, method) {
        if (error instanceof TelegramApiError)
            return error;
        return new TelegramApiError(`telegram ${method} failed: ${this.redact(describeCause(error))}`, undefined, undefined);
    }
    /** Remove the bot token from any string bound for a log or an error. */
    redact(text) {
        return text.split(this.options.token).join('<redacted>');
    }
}
/** Parse a response body, treating unparseable output as a failed call. */
function parseEnvelope(text, method) {
    if (text === '')
        return { ok: true, result: undefined };
    try {
        return JSON.parse(text);
    }
    catch {
        throw new TelegramApiError(`telegram ${method} returned a non-JSON response`, undefined, undefined);
    }
}
/**
 * How long to wait before retrying, or undefined when the failure is final.
 * A 429 names its own delay; everything else uses fixed backoff.
 *
 * @param repeatable - whether repeating this method is safe when the transport
 *   failed and the request's fate is unknown.
 */
function retryDelay(error, attempt, repeatable) {
    if (!(error instanceof TelegramApiError))
        return undefined;
    if (attempt >= MAX_RETRIES - 1)
        return undefined;
    // No status means the request never got an answer: a refused connection, a
    // dropped socket, a name that would not resolve. The poll loop already
    // survives those; an individual call did not, so one flaky connect surfaced
    // to the user as a failure.
    if (error.code === undefined) {
        return repeatable ? (BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]) : undefined;
    }
    if (!RETRYABLE.has(error.code))
        return undefined;
    if (error.retryAfterSeconds !== undefined)
        return error.retryAfterSeconds * 1000;
    const stated = /retry after (\d+)/i.exec(error.description ?? '')?.[1];
    if (stated)
        return Number(stated) * 1000;
    if (error.code === 429)
        return 1000;
    return BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
}
/**
 * One readable line from an error and everything underneath it.
 *
 * Node's fetch reports every transport failure as the same three words —
 * `fetch failed` — and puts what actually happened in `cause`: a refused
 * connection, an unresolved name, an expired certificate, a timeout. Reporting
 * only the top layer turns four distinct problems into one unactionable
 * sentence, which is exactly how far a diagnosis gets on it.
 *
 * @param error - any thrown value.
 * @returns the message chain, outermost first.
 */
export function describeCause(error) {
    const chain = [];
    let current = error;
    // Bounded: a cause chain is normally two or three deep, and a cyclic one
    // must not become an infinite loop inside an error handler.
    for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
        const message = current instanceof Error ? current.message : String(current);
        const code = current.code;
        const labelled = typeof code === 'string' && !message.includes(code) ? `${message} (${code})` : message;
        if (labelled !== '' && !chain.includes(labelled))
            chain.push(labelled);
        current = current instanceof Error ? current.cause : undefined;
    }
    return chain.length > 0 ? chain.join(': ') : String(error);
}
/** Whether a failure means "the edit changed nothing", which is not a failure. */
function isNotModified(error) {
    if (!(error instanceof TelegramApiError))
        return false;
    return /message is not modified/i.test(error.description ?? '');
}
/** Convert our keyboard shape into the Bot API's snake-cased markup. */
function toReplyMarkup(keyboard) {
    return {
        inline_keyboard: keyboard.map((row) => row.map((button) => ({ text: button.text, callback_data: button.callbackData }))),
    };
}
/** Drop undefined values so `parse_mode: undefined` really omits the field. */
function prune(body) {
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}
/** Cancellable sleep used by the retry path. */
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
//# sourceMappingURL=api.js.map