/**
 * The narrow chat surface the interactive prompts are written against.
 *
 * Questions and approvals only ever need to put a message in a chat and later
 * change it. Depending on that instead of the full Bot API client keeps those
 * modules testable with a few lines of stub, and keeps Telegram's request
 * shapes in one place.
 */
import type { TelegramApi } from '../telegram/api.js';
import type { InlineKeyboard } from '../telegram/types.js';
/** Where a prompt is delivered. */
export interface ChatTarget {
    readonly chatId: string;
    readonly threadId?: number;
}
/** Post and revise messages in a chat. */
export interface ChatSurface {
    /**
     * Post a message built by this plugin. HTML, because these are short,
     * assembled from escaped text, and carry the inline keyboards.
     */
    send(target: ChatTarget, html: string, keyboard?: InlineKeyboard): Promise<number>;
    /** Revise a message in place. Passing an empty keyboard retires the buttons. */
    edit(target: ChatTarget, messageId: number, html: string, keyboard?: InlineKeyboard): Promise<void>;
    /**
     * Post agent-authored markdown, which Telegram renders itself — the path a
     * plan or a diff takes, so its tables and code blocks survive.
     */
    sendMarkdown(target: ChatTarget, markdown: string): Promise<number>;
}
/** Bind a {@link ChatSurface} to the live Bot API client. */
export declare function telegramSurface(api: TelegramApi): ChatSurface;
//# sourceMappingURL=surface.d.ts.map