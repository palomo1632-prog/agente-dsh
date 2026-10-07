/**
 * Saying what the agent is doing right now.
 *
 * A turn that spends two minutes running tests emits no text, so the reply
 * shows a placeholder and nothing else — from the outside that is
 * indistinguishable from a bot that has died. The tool calls are already in
 * the session feed; they were simply being dropped.
 *
 * What is shown is deliberately one short line. A tool call's arguments can be
 * an entire file, and the point is reassurance, not a transcript: the finished
 * reply carries the substance, and this disappears when the turn ends.
 */
import { escapeHtml } from '../render/escape.js';
/** Longest activity line shown; a command can be arbitrarily long. */
const MAX_DETAIL = 80;
/**
 * Argument fields worth showing, in the order they are looked for.
 *
 * A tool's most identifying argument is almost always one of these, and
 * guessing from the first key present beats rendering the whole JSON.
 */
const DETAIL_KEYS = [
    'command',
    'cmd',
    'file_path',
    'path',
    'filePath',
    'pattern',
    'query',
    'url',
    'description',
    'name',
];
/**
 * Describe one tool call in a line.
 *
 * @param name - the tool the model invoked.
 * @param argumentsJson - the raw arguments string, exactly as the model wrote
 *   it, which means it may be incomplete or not be JSON at all.
 * @returns a short line, already escaped for the markup it is placed in.
 */
export function describeToolCall(name, argumentsJson) {
    const detail = firstDetail(argumentsJson);
    const label = detail === undefined ? name : `${name}: ${detail}`;
    return escapeHtml(clip(label, MAX_DETAIL));
}
/**
 * Wrap an activity line in the block Telegram shows as "thinking".
 *
 * The tag is valid in rich markdown and rich HTML alike, and is accepted only
 * in a draft — which is exactly its lifetime here.
 *
 * @param activity - the escaped line, or undefined to show nothing.
 */
export function thinkingBlock(activity) {
    if (activity === undefined || activity === '')
        return '';
    return `<tg-thinking>${activity}</tg-thinking>`;
}
/** The first recognisable argument, or undefined when none can be read. */
function firstDetail(argumentsJson) {
    if (!argumentsJson)
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(argumentsJson);
    }
    catch {
        // Arguments stream in, so mid-call they are routinely incomplete JSON.
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return undefined;
    const record = parsed;
    for (const key of DETAIL_KEYS) {
        const value = record[key];
        if (typeof value === 'string' && value.trim() !== '')
            return value.trim().split('\n')[0];
    }
    return undefined;
}
/** Cut a line to length, marking that it was cut. */
function clip(text, max) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max - 1)}…`;
}
//# sourceMappingURL=activity.js.map