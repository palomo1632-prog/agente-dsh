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
import type { BotUser, ChatAction, InlineKeyboard, TelegramFile, TelegramUpdate } from './types.js';
/** A Bot API call that failed, with the token stripped from every field. */
export declare class TelegramApiError extends Error {
    readonly code: number | undefined;
    readonly description: string | undefined;
    /** Seconds Telegram asked us to wait, from a 429's `parameters.retry_after`. */
    readonly retryAfterSeconds?: number | undefined;
    constructor(message: string, code: number | undefined, description: string | undefined, 
    /** Seconds Telegram asked us to wait, from a 429's `parameters.retry_after`. */
    retryAfterSeconds?: number | undefined);
    /** Whether the failure means the bot token itself is not valid. */
    get isAuthFailure(): boolean;
}
/** Construction options; `fetchImpl` and `sleep` exist so tests need no network. */
export interface TelegramApiOptions {
    readonly token: string;
    readonly baseUrl: string;
    readonly timeoutMs: number;
    /** Deadline for one file download; defaults to a minute. */
    readonly downloadTimeoutMs?: number;
    readonly fetchImpl?: typeof fetch;
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
/** Arguments for sending one text message. */
export interface SendMessageOptions {
    readonly chatId: string;
    readonly html: string;
    readonly keyboard?: InlineKeyboard;
    readonly replyToMessageId?: number;
    readonly threadId?: number;
    readonly signal?: AbortSignal;
}
/** Arguments for editing one text message. */
export interface EditMessageOptions {
    readonly chatId: string;
    readonly messageId: number;
    readonly html: string;
    readonly keyboard?: InlineKeyboard;
    readonly signal?: AbortSignal;
}
/** Outcome of an edit: Telegram treats a no-op edit as an error, we do not. */
export type EditOutcome = 'edited' | 'unchanged';
/** Arguments for sending one rich message. */
export interface SendRichOptions {
    readonly chatId: string;
    /** Rich Markdown, which Telegram parses and renders itself. */
    readonly markdown: string;
    readonly keyboard?: InlineKeyboard;
    readonly replyToMessageId?: number;
    readonly threadId?: number;
    readonly signal?: AbortSignal;
}
/** Arguments for one frame of a streamed draft. */
export interface DraftOptions {
    readonly chatId: string;
    /** Stable across a turn: Telegram animates changes to the same draft id. */
    readonly draftId: number;
    readonly markdown: string;
    readonly threadId?: number;
    readonly signal?: AbortSignal;
}
export declare class TelegramApi {
    private readonly options;
    private readonly fetchImpl;
    private readonly sleep;
    private readonly downloadTimeoutMs;
    constructor(options: TelegramApiOptions);
    /** Verify the token and read the bot's own identity. */
    getMe(): Promise<BotUser>;
    /** Drop any webhook so long polling is the only delivery path. */
    deleteWebhook(): Promise<void>;
    /**
     * Long-poll for updates.
     *
     * `allowed_updates` includes `callback_query`, which is what lets a button
     * press reach the agent at all.
     */
    getUpdates(offset: number, timeoutSeconds: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
    /**
     * Send one HTML message, falling back to plain text if Telegram rejects the
     * markup rather than letting the content vanish.
     */
    sendMessage(options: SendMessageOptions): Promise<{
        messageId: number;
    }>;
    /**
     * Edit one message in place — the mechanism behind streamed replies.
     *
     * Telegram answers 400 when the new text equals the old, which during
     * streaming is an ordinary and frequent event, so it is reported rather than
     * thrown.
     */
    editMessageText(options: EditMessageOptions): Promise<EditOutcome>;
    /**
     * Send one rich message.
     *
     * Telegram parses the Rich Markdown itself, so tables, headings, lists and
     * task lists arrive as real elements rather than as an approximation of
     * them — and the cap is 32768 characters rather than 4096.
     */
    sendRichMessage(options: SendRichOptions): Promise<{
        messageId: number;
    }>;
    /**
     * Stream one frame of a partial reply.
     *
     * The draft is a 30-second ephemeral preview, and Telegram animates changes
     * carrying the same `draftId` — so a turn keeps one id throughout and the
     * text grows in place. It must still be persisted with a real send when the
     * turn ends, and it works in private chats only.
     */
    sendRichMessageDraft(options: DraftOptions): Promise<void>;
    /** Replace a message's content with rich markdown. */
    editRichMessage(options: {
        chatId: string;
        messageId: number;
        markdown: string;
        keyboard?: InlineKeyboard;
    }): Promise<EditOutcome>;
    /** Replace or clear a message's inline keyboard, leaving its text alone. */
    editMessageReplyMarkup(options: {
        chatId: string;
        messageId: number;
        keyboard: InlineKeyboard;
    }): Promise<void>;
    /**
     * Acknowledge a button press. Telegram shows a spinner on the button until
     * this lands, so it is sent before any slow work the press triggers.
     */
    answerCallbackQuery(id: string, text?: string): Promise<void>;
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
    uploadFile(method: 'sendPhoto' | 'sendDocument', field: 'photo' | 'document', options: {
        chatId: string;
        data: Uint8Array;
        filename: string;
        contentType: string;
        caption?: string;
        threadId?: number;
    }): Promise<{
        messageId: number;
    }>;
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
    setMyCommands(commands: readonly {
        command: string;
        description: string;
    }[]): Promise<void>;
    /** Show a progress indicator in the chat. Best-effort by design. */
    sendChatAction(chatId: string, action: ChatAction, threadId?: number): Promise<void>;
    /** Resolve a file id to downloadable metadata. */
    getFile(fileId: string): Promise<TelegramFile>;
    /**
     * Download a resolved file's bytes.
     *
     * The download URL carries the token in its path, and a transport failure
     * quotes the URL it was given — so this fetch is wrapped like every other,
     * or a dropped connection would hand the token to the caller's log.
     */
    downloadFile(filePath: string, signal?: AbortSignal): Promise<Uint8Array>;
    /** Base url without a trailing slash. */
    private base;
    /**
     * One Bot API call, with retries for transient failures.
     *
     * @throws {TelegramApiError} with the token redacted from every field.
     */
    private call;
    /**
     * Run one operation, backing off and repeating what is safe to repeat.
     *
     * Shared with the download path rather than living inside `call`: a download
     * is the most retry-worthy request this client makes — a pure read of bytes
     * — and leaving it outside the retry loop is what turned an intermittent
     * connection into a screenshot the agent never saw.
     */
    private withRetries;
    /** One attempt: build, send, validate, unwrap. */
    private request;
    /** Wrap any thrown value as a redacted TelegramApiError. */
    private normalize;
    /** Remove the bot token from any string bound for a log or an error. */
    private redact;
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
export declare function describeCause(error: unknown): string;
//# sourceMappingURL=api.d.ts.map