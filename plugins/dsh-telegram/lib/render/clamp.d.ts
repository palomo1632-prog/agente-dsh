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
/**
 * Escape text, cutting it down until the escaped form fits.
 *
 * @param text - raw, possibly model-authored text.
 * @param maxEscaped - the budget in characters of the escaped result.
 * @returns escaped html no longer than `maxEscaped`.
 */
export declare function escapeWithin(text: string, maxEscaped: number): string;
/**
 * Cut raw text to a length, on a word boundary where one is close by.
 *
 * @param text - the raw text.
 * @param max - maximum characters.
 */
export declare function clamp(text: string, max: number): string;
//# sourceMappingURL=clamp.d.ts.map