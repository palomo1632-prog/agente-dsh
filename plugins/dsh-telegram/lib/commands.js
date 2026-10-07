/**
 * Slash commands.
 *
 * Telegram delivers a command as ordinary message text, and in a group it
 * arrives addressed — `/new@my_bot` — because several bots may share the chat.
 * Parsing is therefore a real step rather than a `startsWith`, and a command
 * addressed to a different bot must be ignored rather than executed.
 */
import { escapeHtml } from './render/escape.js';
/** Telegram refuses a menu description longer than this. */
const MAX_MENU_DESCRIPTION = 256;
/** Commands the plugin answers, with the one-line help shown by `/help`. */
export const COMMANDS = {
    start: 'Mostrar qué es este bot y si podés usarlo',
    help: 'Listar los comandos',
    compact: 'Resumir la conversación vieja para liberar espacio',
    goal: 'Fijar o ver el objetivo de una tarea larga (clear, pause, resume)',
    claim: 'Tomar el control del bot: /claim CODIGO',
    new: 'Empezar una conversación nueva, olvidando la actual',
    cd: 'Ver o cambiar la carpeta de trabajo: /cd ~/proyectos/app',
    model: 'Ver o cambiar el modelo: /model list, o /model proveedor/modelo',
    effort: 'Ver o cambiar cuánto piensa antes de responder: /effort high',
    vision: 'Ver o cambiar el modelo que lee imágenes: /vision off',
    permission: 'Ver o cambiar lo que el agente puede hacer: /permission read-only',
    diag: 'Mostrar qué ve el plugin de sí mismo y las fallas recientes',
    screenshot: 'Mandar una foto de la pantalla de la máquina',
    sessions: 'Retomar una conversación anterior de este chat',
    status: 'Mostrar la sesión, la carpeta y quién es el dueño del bot',
    stop: 'Cancelar lo que el agente esté haciendo ahora',
    whoami: 'Mostrar tu id de usuario de Telegram',
};
/**
 * Parse a message as a command.
 *
 * @param text - the raw message text.
 * @param botUsername - this bot's username, so `/cmd@other_bot` is ignored.
 * @returns the command, or undefined when the text is not one for us.
 */
export function parseCommand(text, botUsername) {
    const match = /^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text.trim());
    if (!match)
        return undefined;
    const addressed = match[2];
    if (addressed !== undefined && botUsername !== undefined) {
        if (addressed.toLowerCase() !== botUsername.toLowerCase())
            return undefined;
    }
    const name = match[1].toLowerCase();
    if (!(name in COMMANDS))
        return undefined;
    return { name, args: (match[3] ?? '').trim() };
}
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
export function commandMenu(claimable) {
    return Object.entries(COMMANDS)
        .filter(([name]) => claimable || name !== 'claim')
        .map(([command, description]) => ({
        command,
        description: description.slice(0, MAX_MENU_DESCRIPTION),
    }));
}
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
export function helpText() {
    const lines = Object.entries(COMMANDS).map(([name, description]) => `/${name} — ${escapeHtml(description)}`);
    return `<b>Commands</b>\n${lines.join('\n')}`;
}
//# sourceMappingURL=commands.js.map