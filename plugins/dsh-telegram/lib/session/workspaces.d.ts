/**
 * Working out which directory a `/cd` argument names.
 *
 * The store itself is {@link ChatPreferences}: a chat's directory and a chat's
 * model are the same shape — one durable string per conversation that has to
 * outlive both `/new` and a restart — so they share one implementation.
 *
 * A session's cwd is fixed when the session opens; the sandbox derives its
 * writable root from it and the harness calls that root immutable. Changing
 * directory therefore starts a new conversation, which is why the choice
 * cannot live on the session binding that `/new` discards.
 */
/**
 * Work out which directory a `/cd` argument names.
 *
 * Pure, so every spelling a person might type is pinned by a test rather than
 * discovered in a chat. Nothing here touches the filesystem — whether the
 * result exists is the caller's question, and a separate one.
 *
 * @param input - what the user typed after `/cd`.
 * @param current - the conversation's directory now, for relative paths.
 * @param home - the user's home directory, for `~`.
 * @returns an absolute, normalized path, or undefined for empty input.
 */
export declare function resolveDirectory(input: string, current: string, home: string): string | undefined;
/** Whether a stored directory is still usable as one. */
export declare function isUsableDirectory(value: string): boolean;
//# sourceMappingURL=workspaces.d.ts.map