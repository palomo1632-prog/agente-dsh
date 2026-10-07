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
import { isAbsolute, resolve } from 'node:path';
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
export function resolveDirectory(input, current, home) {
    // Paths get pasted from a terminal, and a shell would have eaten the quotes.
    const trimmed = unquote(input.trim());
    if (trimmed === '')
        return undefined;
    if (trimmed === '~')
        return resolve(home);
    if (trimmed.startsWith('~/'))
        return resolve(home, trimmed.slice(2));
    // A bare `~user` is deliberately NOT expanded: resolving another account's
    // home needs the password database, and guessing it wrong would silently
    // open a directory the user did not name.
    if (isAbsolute(trimmed))
        return resolve(trimmed);
    return resolve(current, trimmed);
}
/** Strip one matching pair of surrounding quotes. */
function unquote(text) {
    const quoted = (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"));
    return quoted && text.length >= 2 ? text.slice(1, -1) : text;
}
/** Whether a stored directory is still usable as one. */
export function isUsableDirectory(value) {
    // A relative path would resolve against whatever the process happens to be
    // running in, which is not the directory the user chose.
    return isAbsolute(value);
}
//# sourceMappingURL=workspaces.js.map