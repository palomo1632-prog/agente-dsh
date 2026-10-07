/**
 * The narrow chat surface the interactive prompts are written against.
 *
 * Questions and approvals only ever need to put a message in a chat and later
 * change it. Depending on that instead of the full Bot API client keeps those
 * modules testable with a few lines of stub, and keeps Telegram's request
 * shapes in one place.
 */
/** Bind a {@link ChatSurface} to the live Bot API client. */
export function telegramSurface(api) {
    return {
        async send(target, html, keyboard) {
            const sent = await api.sendMessage({
                chatId: target.chatId,
                html,
                ...(keyboard ? { keyboard } : {}),
                ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
            });
            return sent.messageId;
        },
        async edit(target, messageId, html, keyboard) {
            await api.editMessageText({
                chatId: target.chatId,
                messageId,
                html,
                ...(keyboard ? { keyboard } : {}),
            });
        },
        async sendMarkdown(target, markdown) {
            const sent = await api.sendRichMessage({
                chatId: target.chatId,
                markdown,
                ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
            });
            return sent.messageId;
        },
    };
}
//# sourceMappingURL=surface.js.map