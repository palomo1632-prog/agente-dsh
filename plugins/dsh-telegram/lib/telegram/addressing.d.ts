/**
 * Whether a message in a group was meant for this bot.
 *
 * In a private chat the question does not arise: every message is for the bot,
 * because there is nobody else there. A group is the opposite — people talk to
 * each other all day, and a bot that answers every line is one nobody keeps in
 * the room. Telegram's own convention is the one users already expect: address
 * it by @handle, or reply to something it said.
 *
 * This is separate from access. Access asks whether a person MAY drive the
 * agent and is checked first; this asks whether they were talking to it at all.
 * Conflating them would either let a stranger's @mention through or make the
 * allowlist decide conversational etiquette.
 */
import type { TelegramMessage } from './types.js';
/** Whether a chat is one where other people are talking too. */
export declare function isGroupChat(message: TelegramMessage): boolean;
/**
 * Whether this message addresses the bot.
 *
 * @param message - the incoming message.
 * @param botUsername - this bot's @handle, without the `@`.
 * @param botId - this bot's user id, for recognising a reply to itself.
 * @returns true in a private chat, and in a group only when addressed.
 */
export declare function addressesBot(message: TelegramMessage, botUsername: string | undefined, botId: number | undefined): boolean;
/**
 * Remove the bot's own @mention from the text it was addressed with.
 *
 * The mention is addressing, not content. Left in, every prompt in a group
 * would open with the bot's own name, which reads to the model as part of the
 * question.
 *
 * @param text - the message text.
 * @param botUsername - this bot's @handle, without the `@`.
 * @returns the text without a leading or trailing self-mention.
 */
export declare function stripMention(text: string, botUsername: string | undefined): string;
//# sourceMappingURL=addressing.d.ts.map