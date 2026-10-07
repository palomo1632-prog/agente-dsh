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
/**
 * Describe one tool call in a line.
 *
 * @param name - the tool the model invoked.
 * @param argumentsJson - the raw arguments string, exactly as the model wrote
 *   it, which means it may be incomplete or not be JSON at all.
 * @returns a short line, already escaped for the markup it is placed in.
 */
export declare function describeToolCall(name: string, argumentsJson: string | undefined): string;
/**
 * Wrap an activity line in the block Telegram shows as "thinking".
 *
 * The tag is valid in rich markdown and rich HTML alike, and is accepted only
 * in a draft — which is exactly its lifetime here.
 *
 * @param activity - the escaped line, or undefined to show nothing.
 */
export declare function thinkingBlock(activity: string | undefined): string;
//# sourceMappingURL=activity.d.ts.map