/**
 * HTML escaping for the plugin's own messages.
 *
 * Agent replies are sent as rich markdown for Telegram to render, but the
 * prompts this plugin writes itself — questions, approvals, command answers —
 * stay on HTML: they are short, they carry inline keyboards, and they embed
 * model-authored text that must not be able to introduce markup.
 *
 * Telegram's HTML mode is not a browser: it recognises a fixed tag whitelist
 * and treats everything else as text. Only `&`, `<` and `>` can start markup,
 * so those are the only three characters that must be escaped.
 */
/** Escape text content so Telegram reads it as text, never as markup. */
export function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
//# sourceMappingURL=escape.js.map