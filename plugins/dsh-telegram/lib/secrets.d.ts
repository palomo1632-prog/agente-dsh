/**
 * The one place that knows what must never be written down.
 *
 * A bot token reaches further than the code that uses it. It sits in every
 * request URL, so a network library that quotes the URL in an error — undici
 * does — hands the token to whatever catches that error: a log, a status file,
 * a message posted back into the chat. Each of those is a different module,
 * and asking each to remember the token would mean each can forget.
 *
 * So the token is registered once and every outbound text passes through here.
 */
export declare class SecretRegistry {
    private readonly secrets;
    /**
     * Register a value that must never appear in text this plugin emits.
     *
     * @param secret - the raw value; ignored when too short to redact safely.
     */
    protect(secret: string | undefined): void;
    /**
     * Strip every registered secret from a string.
     *
     * @param text - anything bound for a log, a file, or a chat.
     * @returns the same text with each secret replaced by a marker.
     */
    redact(text: string): string;
    /** A bound redactor, for passing to a module that should not hold the registry. */
    redactor(): (text: string) => string;
}
//# sourceMappingURL=secrets.d.ts.map