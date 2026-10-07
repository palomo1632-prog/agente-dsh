/**
 * Splitting a reply that outgrows one message.
 *
 * At 32768 characters this is rare, but a file listing or a long diff still
 * reaches it. Telegram parses the markdown itself, so the split has to happen
 * where the markdown stays coherent: cutting inside a fenced code block would
 * leave the first chunk with an unterminated fence and the second beginning
 * with a stray one, and Telegram would render both wrongly.
 *
 * So the split walks block boundaries — blank lines first, then line breaks —
 * and closes and reopens a fence it had to cut through.
 */
/**
 * Split markdown into chunks Telegram will accept.
 *
 * @param markdown - the reply as the agent wrote it.
 * @param limit - maximum characters per message.
 * @returns chunks in order; empty when there is no visible content.
 */
export declare function splitMarkdown(markdown: string, limit: number): string[];
//# sourceMappingURL=split-markdown.d.ts.map