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
/** Whether a chat is one where other people are talking too. */
export function isGroupChat(message) {
    const type = message.chat.type;
    return type === 'group' || type === 'supergroup';
}
/**
 * Whether this message addresses the bot.
 *
 * @param message - the incoming message.
 * @param botUsername - this bot's @handle, without the `@`.
 * @param botId - this bot's user id, for recognising a reply to itself.
 * @returns true in a private chat, and in a group only when addressed.
 */
export function addressesBot(message, botUsername, botId) {
    if (!isGroupChat(message))
        return true;
    // A reply to something the bot said continues that exchange. This is the
    // path that makes a group usable: nobody wants to re-@mention a bot to say
    // "yes, do it".
    const repliedTo = message.reply_to_message?.from;
    if (repliedTo !== undefined && botId !== undefined && repliedTo.id === botId)
        return true;
    const text = message.text ?? message.caption;
    if (text === undefined)
        return false;
    const entities = message.entities ?? message.caption_entities ?? [];
    for (const entity of entities) {
        // `text_mention` names a user without a @handle — the reliable signal when
        // a bot has none, and the only one for an account that hides its username.
        if (entity.type === 'text_mention') {
            if (botId !== undefined && entity.user?.id === botId)
                return true;
            continue;
        }
        if (entity.type !== 'mention' || botUsername === undefined)
            continue;
        // Compared against the entity's own span rather than searched for in the
        // text: `@mybot_staging` contains `@mybot`, and a substring match would
        // hand another bot's mentions to this one.
        const mentioned = text.slice(entity.offset, entity.offset + entity.length);
        if (mentioned.toLowerCase() === `@${botUsername.toLowerCase()}`)
            return true;
    }
    return false;
}
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
export function stripMention(text, botUsername) {
    if (botUsername === undefined)
        return text;
    const mention = new RegExp(`@${escapeRegExp(botUsername)}\\b`, 'gi');
    return text.replace(mention, ' ').replace(/\s+/g, ' ').trim();
}
/** Quote a username for use inside a pattern. */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=addressing.js.map