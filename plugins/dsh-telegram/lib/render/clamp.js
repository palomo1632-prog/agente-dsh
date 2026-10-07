/**
 * Keeping the plugin's own prompts inside Telegram's message limit.
 *
 * Agent replies go out as rich messages and get 32768 characters. The prompts
 * this plugin assembles — an approval, a question, a status line — stay on
 * plain HTML and get 4096, and they embed model-authored text of no fixed
 * length: a tool's stated reason, a question's option descriptions.
 *
 * Left unbounded, a verbose reason pushes the message past the limit, the send
 * fails, and the approval fails closed — the agent is refused permission it
 * was never actually asked about, and nobody sees a button. Bounding the
 * inputs is what keeps that from being possible.
 *
 * Escaping is the subtlety: `&` becomes `&amp;`, so escaped text can be five
 * times longer than its source. Cutting after escaping risks splitting an
 * entity, so the text is cut first and escaped afterwards, shrinking until the
 * escaped form fits.
 */
import { escapeHtml } from './escape.js';
/** Marker showing the reader that text was cut. */
const ELLIPSIS = '…';
/**
 * Escape text, cutting it down until the escaped form fits.
 *
 * @param text - raw, possibly model-authored text.
 * @param maxEscaped - the budget in characters of the escaped result.
 * @returns escaped html no longer than `maxEscaped`.
 */
export function escapeWithin(text, maxEscaped) {
    if (maxEscaped <= 0)
        return '';
    const escaped = escapeHtml(text);
    if (escaped.length <= maxEscaped)
        return escaped;
    // Shrink proportionally rather than character by character: escaping expands
    // by a factor, so one or two passes converge where a linear walk would take
    // thousands.
    let cut = text;
    for (let attempt = 0; attempt < 8 && cut.length > 1; attempt += 1) {
        const current = escapeHtml(cut);
        if (current.length <= maxEscaped - ELLIPSIS.length)
            break;
        const ratio = (maxEscaped - ELLIPSIS.length) / current.length;
        cut = cut.slice(0, Math.max(1, Math.floor(cut.length * ratio) - 1));
    }
    return `${escapeHtml(trimTail(cut))}${ELLIPSIS}`;
}
/**
 * Cut raw text to a length, on a word boundary where one is close by.
 *
 * @param text - the raw text.
 * @param max - maximum characters.
 */
export function clamp(text, max) {
    if (text.length <= max)
        return text;
    return `${trimTail(text.slice(0, Math.max(1, max - ELLIPSIS.length)))}${ELLIPSIS}`;
}
/** Drop a partial trailing word and any whitespace before the marker. */
function trimTail(text) {
    const lastSpace = text.lastIndexOf(' ');
    const trimmed = lastSpace > text.length * 0.6 ? text.slice(0, lastSpace) : text;
    return trimmed.trimEnd();
}
//# sourceMappingURL=clamp.js.map