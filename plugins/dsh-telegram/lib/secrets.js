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
/**
 * Shortest secret worth stripping.
 *
 * Redacting a short string would mangle ordinary text — and redacting the
 * empty string would insert a marker between every character — so anything
 * below this is refused rather than trusted to be harmless.
 */
const MIN_SECRET_LENGTH = 8;
export class SecretRegistry {
    secrets = new Set();
    /**
     * Register a value that must never appear in text this plugin emits.
     *
     * @param secret - the raw value; ignored when too short to redact safely.
     */
    protect(secret) {
        if (secret === undefined)
            return;
        if (secret.length < MIN_SECRET_LENGTH)
            return;
        this.secrets.add(secret);
    }
    /**
     * Strip every registered secret from a string.
     *
     * @param text - anything bound for a log, a file, or a chat.
     * @returns the same text with each secret replaced by a marker.
     */
    redact(text) {
        let safe = text;
        for (const secret of this.secrets)
            safe = safe.split(secret).join('<redacted>');
        return safe;
    }
    /** A bound redactor, for passing to a module that should not hold the registry. */
    redactor() {
        return (text) => this.redact(text);
    }
}
//# sourceMappingURL=secrets.js.map