/**
 * The slice of the Telegram Bot API this plugin actually speaks.
 *
 * Deliberately partial: every field here is one the adapter reads, so an
 * upstream schema change surfaces as a type error at the exact use site rather
 * than as a silently-undefined value deep in the pipeline.
 */
export {};
//# sourceMappingURL=types.js.map