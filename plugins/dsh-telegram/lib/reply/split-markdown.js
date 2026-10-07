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
/** Opening or closing fence of a code block, capturing its language. */
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)/;
/** How far back from the limit a cleaner boundary is still worth taking. */
const BOUNDARY_SEARCH_RATIO = 0.5;
/**
 * Split markdown into chunks Telegram will accept.
 *
 * @param markdown - the reply as the agent wrote it.
 * @param limit - maximum characters per message.
 * @returns chunks in order; empty when there is no visible content.
 */
export function splitMarkdown(markdown, limit) {
    const trimmed = markdown.trim();
    if (trimmed === '')
        return [];
    if (trimmed.length <= limit)
        return [trimmed];
    const chunks = [];
    let rest = trimmed;
    /** The fence a previous chunk was cut inside, to reopen at the next start. */
    let openFence;
    while (rest.length > 0) {
        const prefix = openFence ? `${openFence.marker}${openFence.language}\n` : '';
        const budget = limit - prefix.length;
        if (rest.length <= budget) {
            chunks.push(prefix + rest);
            break;
        }
        const cut = findCut(rest, budget);
        const body = rest.slice(0, cut);
        const carried = openFence;
        openFence = fenceLeftOpen(body, openFence);
        const suffix = openFence ? `\n${openFence.marker}` : '';
        chunks.push(prefix + body.trimEnd() + suffix);
        rest = rest.slice(cut).replace(/^\n+/, '');
        if (carried && !openFence)
            openFence = undefined;
    }
    return chunks;
}
/** The latest clean boundary within `budget`, or a hard cut when there is none. */
function findCut(markdown, budget) {
    const floor = Math.floor(budget * BOUNDARY_SEARCH_RATIO);
    for (const boundary of ['\n\n', '\n']) {
        const at = markdown.lastIndexOf(boundary, budget - boundary.length);
        if (at >= floor)
            return at + boundary.length;
    }
    return budget;
}
/**
 * Whether a chunk ended inside a code fence, and which one.
 *
 * Fences toggle, so folding them in order tells us what is still open at the
 * cut — the only construct where reopening matters, because Telegram treats
 * the rest of the document as code until the fence closes.
 */
function fenceLeftOpen(body, carried) {
    let open = carried;
    for (const line of body.split('\n')) {
        const match = FENCE.exec(line);
        if (!match)
            continue;
        const marker = match[1];
        if (open) {
            // A closing fence is the same character, at least as long.
            if (marker[0] === open.marker[0] && marker.length >= open.marker.length)
                open = undefined;
            continue;
        }
        open = { marker, language: match[2] ?? '' };
    }
    return open;
}
//# sourceMappingURL=split-markdown.js.map