/**
 * Slash commands.
 *
 * Telegram delivers a command as ordinary message text, and in a group it
 * arrives addressed — `/new@my_bot` — because several bots may share the chat.
 * Parsing is therefore a real step rather than a `startsWith`, and a command
 * addressed to a different bot must be ignored rather than executed.
 */
/** A recognised command and the text that followed it. */
export interface ParsedCommand {
    /** Command name, lowercased, without the slash or the bot suffix. */
    readonly name: string;
    /** Everything after the command, trimmed; empty when there was nothing. */
    readonly args: string;
}
/** Commands the plugin answers, with the one-line help shown by `/help`. */
export declare const COMMANDS: Readonly<Record<string, string>>;
/**
 * Parse a message as a command.
 *
 * @param text - the raw message text.
 * @param botUsername - this bot's username, so `/cmd@other_bot` is ignored.
 * @returns the command, or undefined when the text is not one for us.
 */
export declare function parseCommand(text: string, botUsername?: string): ParsedCommand | undefined;
/**
 * The command menu to publish, for the list Telegram shows on `/`.
 *
 * `/claim` is left out once the bot has an owner: it is the one command that
 * stops working the moment it succeeds, and offering it forever invites
 * everyone who opens the chat to try a code that can no longer be right.
 *
 * @param claimable - whether the bot is still waiting to be claimed.
 * @returns entries in menu order, descriptions clipped to Telegram's limit.
 */
export declare function commandMenu(claimable: boolean): {
    command: string;
    description: string;
}[];
/**
 * The `/help` body, rendered as Telegram HTML.
 *
 * The descriptions are prose, not markup, so they are escaped on the way in.
 * `/claim <code>` is the reason: sent raw with `parse_mode: HTML`, Telegram
 * read `<code>` as an unclosed tag and rejected the WHOLE message with a 400 —
 * so `/help` answered with silence, which reads as a dead bot rather than as a
 * malformed message. Escaping here means a description added later cannot do
 * it again.
 */
export declare function helpText(): string;
//# sourceMappingURL=commands.d.ts.map