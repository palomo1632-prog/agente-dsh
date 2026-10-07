/**
 * Routing one incoming Telegram update.
 *
 * Every update arrives here and leaves as exactly one of: a refusal, a
 * command, an answer to a pending prompt, a button press, or a prompt for the
 * agent. The order those are tried in is the whole design:
 *
 * 1. **Access first.** Nothing else runs for a user who is not allowed, so no
 *    unauthorised text ever reaches the agent, not even as a command.
 * 2. **Pending prompts before commands.** If a question is waiting for typed
 *    input, that is what the user is answering — routing it to the agent as a
 *    new prompt would strand the question forever.
 * 3. **Commands before prompts.** Otherwise `/new` would be a message asking
 *    the agent about the word "new".
 *
 * Failures are reported into the chat rather than thrown: an update handler
 * that throws would abort the long-poll loop and take the bot offline.
 */
import { COMMANDS, helpText, parseCommand } from './commands.js';
import { AlbumBuffer, captionOf } from './telegram/albums.js';
import { addressesBot, isGroupChat, stripMention } from './telegram/addressing.js';
import { escapeHtml } from './render/escape.js';
import { SILENT_LOGGER } from './harness/types.js';
/**
 * A parenthetical naming the layer beneath this conversation's choice.
 *
 * Empty when the conversation is simply following the deployment, because
 * there is then only one answer and pointing at it would be noise.
 */
function originNote(control, target) {
    const note = control.origin?.(target);
    return note === undefined ? '' : `\n<i>${escapeHtml(note)}</i>`;
}
/** Words that mean "no reader at all", as anyone would type them. */
const OFF_WORDS = new Set(['off', 'none', 'no', 'disable', 'disabled']);
/**
 * Render the conversation's facts as a markdown table.
 *
 * Pipes inside a value would split a cell and shift every column after it, so
 * they are escaped — a working directory can contain one, and a model id from
 * a router-style provider routinely does.
 */
function statusTable(rows) {
    const body = rows
        .map((row) => `| ${escapeCell(row.label)} | ${escapeCell(row.value)} |`)
        .join('\n');
    return `| | |\n| --- | --- |\n${body}`;
}
/** Keep a value inside its own cell. */
function escapeCell(value) {
    return value.split('|').join('\\|').replace(/\r?\n/g, ' ');
}
export class UpdateRouter {
    options;
    /**
     * Albums still arriving, if this deployment reads attachments at all.
     *
     * Owned here rather than injected because its whole job is to defer part of
     * this class's own work back to it.
     */
    albums;
    logger;
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
        this.albums = options.media
            ? new AlbumBuffer({
                deliver: (messages) => void this.onAlbum(messages),
                ...(options.albumWindowMs === undefined ? {} : { windowMs: options.albumWindowMs }),
            })
            : undefined;
    }
    /** Stop waiting on albums still arriving — the plugin is unloading. */
    dispose() {
        this.albums?.dispose();
    }
    /**
     * Handle one update. Never throws: a thrown handler would stop the poll loop.
     *
     * @param update - one raw update from `getUpdates`.
     */
    async handle(update) {
        try {
            if (update.callback_query)
                return await this.onCallback(update.callback_query);
            const message = update.message ?? update.edited_message;
            if (message)
                return await this.onMessage(message);
        }
        catch (error) {
            this.logger.error('[dsh-telegram] update handling failed', error);
        }
    }
    /** A button press: acknowledge first, then route it. */
    async onCallback(query) {
        // Telegram spins the button until this lands, so acknowledge before any
        // slow work the press unblocks.
        await this.options.chat.answerCallbackQuery(query.id);
        if (this.options.access.check(query.from.id) !== 'allowed')
            return;
        const routed = this.options.questions.handleCallback(query.data) ||
            this.options.approvals.handleCallback(query.data) ||
            (this.options.recovery?.handleCallback(query.data) ?? false) ||
            (this.options.sessions?.handleCallback(query.data) ?? false);
        if (!routed) {
            this.logger.debug('[dsh-telegram] ignoring a stale or unknown button press');
        }
    }
    /** An incoming message: access, pending prompt, command, then prompt. */
    async onMessage(message) {
        const target = targetOf(message);
        const userId = message.from?.id;
        if (userId === undefined)
            return;
        const raw = message.text ?? message.caption;
        const decision = this.options.access.check(userId);
        if (decision !== 'allowed')
            return await this.onUnauthorized(target, userId, raw, decision);
        // Asked after access and before anything else: a group is a room where
        // people talk to each other, and a bot that answers every line is one
        // nobody keeps around. Silence is the whole response — a message that was
        // not for us deserves no reply, not even a refusal.
        if (this.options.requireAddressing && !addressesBot(message, this.options.botUsername, this.options.botId)) {
            return;
        }
        // The @mention is addressing, not content. Left in, every prompt from a
        // group would open with the bot's own name, which the model reads as part
        // of the question.
        const text = raw !== undefined && isGroupChat(message)
            ? stripMention(raw, this.options.botUsername) || undefined
            : raw;
        const carriesMedia = hasMedia(message);
        // A waiting question wants typed words, and a command is never a file, so
        // both checks look at plain text only.
        if (text !== undefined && !carriesMedia) {
            if (this.options.textCapture.deliver(target, text))
                return;
            const command = parseCommand(text, this.options.botUsername);
            if (command)
                return await this.onCommand(target, userId, command.name, command.args);
        }
        if (message.voice && this.options.voice) {
            const release = this.options.typing?.hold(target);
            try {
                const result = await this.options.voice.transcribe(message.voice);
                if (result.kind === 'failure') {
                    await this.say(target, escapeHtml(result.notice));
                    return;
                }
                await this.say(target, `📝 ${escapeHtml(result.text)}`);
                const spoken = text ? `${text}\n\n${result.text}` : result.text;
                if (this.options.textCapture.deliver(target, spoken))
                    return;
                await this.runPrompt(target, [{ type: 'text', text: spoken }]);
            }
            finally {
                release?.();
            }
            return;
        }
        if (!carriesMedia) {
            if (text === undefined) {
                return await this.say(target, 'Puedo leer texto, imágenes y archivos de texto.');
            }
            return await this.runPrompt(target, [{ type: 'text', text }]);
        }
        if (!this.options.media) {
            return await this.say(target, 'Este bot no está configurado para leer adjuntos.');
        }
        // An album arrives as several updates sharing one id, with the caption on
        // exactly one of them. Held rather than answered, and delivered as a whole
        // once it stops growing — otherwise three screenshots become three turns,
        // two of them with no question attached.
        if (this.albums?.offer(message) === true)
            return;
        // Held across the whole of it. Downloading a large file, retrying one that
        // failed, and reading an image on a vision model all outlast Telegram's
        // five-second action several times over, and none of them show anything in
        // the chat while they run.
        const release = this.options.typing?.hold(target);
        try {
            const collected = await this.options.media.collect(message, text, {
                modelSees: await this.modelSees(target),
            });
            // Said first: the user should not have to wait for a reply to learn that
            // what they attached went nowhere.
            if (collected.notice)
                await this.say(target, escapeHtml(collected.notice));
            await this.runPrompt(target, collected.parts);
        }
        finally {
            release?.();
        }
    }
    /**
     * Handle a whole album as one message.
     *
     * Access and addressing were already decided for each part as it arrived, so
     * what is left is the part a single photo would have taken.
     *
     * @param messages - the album's parts, in the order they were sent.
     */
    async onAlbum(messages) {
        const first = messages[0];
        if (!first || !this.options.media)
            return;
        const target = targetOf(first);
        const caption = captionOf(messages);
        const release = this.options.typing?.hold(target);
        try {
            const collected = await this.options.media.collectAll(messages, caption, {
                modelSees: await this.modelSees(target),
            });
            if (collected.notice)
                await this.say(target, escapeHtml(collected.notice));
            await this.runPrompt(target, collected.parts);
        }
        catch (error) {
            this.logger.error('[dsh-telegram] could not read an album', error);
            await this.say(target, '⚠️ No se pudieron leer esos archivos.');
        }
        finally {
            release?.();
        }
    }
    /**
     * A user who may not drive the agent. An unclaimed bot still accepts
     * `/claim`, because that is the only way it ever becomes usable.
     */
    async onUnauthorized(target, userId, text, decision) {
        const command = text === undefined ? undefined : parseCommand(text, this.options.botUsername);
        if (decision === 'unclaimed' && command?.name === 'claim') {
            const claimed = await this.options.access.claim(userId, command.args);
            return await this.say(target, claimed
                ? '✅ Listo. Ahora este bot te responde sólo a vos.'
                : '❌ Ese código no es correcto.');
        }
        if (decision === 'unclaimed') {
            return await this.say(target, 'Este bot todavía no tiene dueño.\nMandá <code>/claim CODIGO</code> con el código que aparece en la consola del server.');
        }
        this.logger.warn(`[dsh-telegram] refused a message from user ${userId}`);
        await this.say(target, '⛔ No estás autorizado a usar este bot.');
    }
    /** Run one command. */
    async onCommand(target, userId, name, args) {
        switch (name) {
            case 'start':
                return await this.say(target, `👋 Conectado a DeepSeek Harness.\nMandá un mensaje para hablar con el agente.\n\n${helpText()}`);
            case 'help':
                return await this.say(target, helpText());
            case 'claim':
                return await this.say(target, 'Este bot ya tiene dueño.');
            case 'whoami':
                return await this.say(target, `Tu id de usuario de Telegram es <code>${userId}</code>.`);
            case 'new':
                await this.options.runner.reset(target);
                return await this.say(target, '🆕 Empecé una conversación nueva.');
            case 'cd':
                return await this.onChangeDirectory(target, args);
            case 'model':
                return await this.onModel(target, args);
            case 'effort':
                return await this.onEffort(target, args);
            case 'vision':
                return await this.onVision(target, args);
            case 'permission':
                return await this.onPermission(target, args);
            case 'diag':
                return await this.onDiagnostics(target);
            case 'screenshot':
                return await this.onScreenshot(target);
            case 'sessions':
                if (!this.options.sessions) {
                    return await this.say(target, 'Esta instalación no guarda la lista de conversaciones.');
                }
                // The offer remains pending until a later callback update presses one
                // of its buttons. Waiting here would block the sequential poller from
                // receiving the callback that can settle it.
                void this.options.sessions.offer(target).catch((error) => {
                    this.logger.error('[dsh-telegram] session picker failed', error);
                });
                return;
            case 'stop': {
                const stopped = await this.options.runner.stop(target);
                return await this.say(target, stopped ? '🛑 Frenado.' : 'No había nada corriendo.');
            }
            case 'status':
                return await this.describeConversation(target);
            default:
                // Los comandos del harness (/compact, /goal) viven en el registro del
                // agente, no en este plugin: se le pasa la línea y se muestra su respuesta.
                const harnessCommand = this.options.harnessCommand;
                if (harnessCommand) {
                    const result = await harnessCommand(target, `/${name}${args === '' ? '' : ` ${args}`}`);
                    if (result !== undefined) {
                        if (result.kind === 'error')
                            return await this.say(target, `⚠️ ${escapeHtml(result.text)}`);
                        return await this.say(target, result.text === undefined ? '✅ Listo.' : `✅ ${escapeHtml(result.text)}`);
                    }
                }
                // Solo los comandos propios del plugin llegan acá con un nombre que este
                // registro no conoce.
                return await this.say(target, `Comando desconocido. Probá con ${Object.keys(COMMANDS).join(', ')}.`);
        }
    }
    /** Hand a prompt to the agent, reporting a failure into the chat. */
    async runPrompt(target, content) {
        // A prompt is not instant even without attachments: it may wait behind the
        // conversation's previous message, and an image in it is read before the
        // conversation ever sees it.
        const release = this.options.typing?.hold(target);
        try {
            await this.options.runner.prompt(target, content);
        }
        catch (error) {
            const raw = error instanceof Error ? error.message : String(error);
            const reason = this.options.redact?.(raw) ?? raw;
            this.logger.error('[dsh-telegram] prompt failed', error);
            await this.say(target, `⚠️ ${escapeHtml(reason)}`);
        }
        finally {
            release?.();
        }
    }
    /**
     * Report what this plugin can see about itself.
     *
     * Exists because several profiles compose no log sink at all, so a plugin
     * that only logs its failures is silent about them. Every fault found here
     * so far was found by someone noticing odd behaviour in a chat and asking —
     * the seam list in particular would have shown at a glance that Telegram
     * agents were joining no preset, and therefore had almost no tools.
     *
     * @param target - the conversation asking.
     */
    async onDiagnostics(target) {
        const diagnostics = this.options.diagnostics;
        if (!diagnostics) {
            return await this.say(target, 'Esta instalación no guarda diagnósticos.');
        }
        const report = await diagnostics.report();
        const seams = report.seams
            .map((seam) => `| ${escapeCell(seam.name)} | ${seam.present ? '✅' : '❌'} |`)
            .join('\n');
        const failures = report.failures.length === 0
            ? '_No hubo fallas desde el último reinicio._'
            : report.failures
                .map((failure) => `- \`${failure.at.replace('T', ' ').slice(0, 19)}\` ` +
                `${failure.level === 'error' ? '🔴' : '🟠'} ${failure.message}`)
                .join('\n');
        const markdown = [
            '**Conexión**',
            '',
            `| | |\n| --- | --- |\n${report.status
                .map((row) => `| ${escapeCell(row.label)} | ${escapeCell(row.value)} |`)
                .join('\n')}`,
            '',
            '**Enganches internos**',
            '',
            `| | |\n| --- | --- |\n${seams}`,
            '',
            `**Fallas recientes** (${report.failures.length})`,
            '',
            failures,
        ].join('\n');
        if (this.options.chat.sendRichMessage) {
            try {
                await this.options.chat.sendRichMessage({
                    chatId: target.chatId,
                    markdown,
                    ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
                });
                return;
            }
            catch (error) {
                this.logger.warn('[dsh-telegram] could not send the diagnostics', error);
            }
        }
        await this.say(target, report.status
            .map((row) => `<b>${escapeHtml(row.label)}</b> <code>${escapeHtml(row.value)}</code>`)
            .join('\n'));
    }
    /**
     * Send a picture of the screen the harness is running on.
     *
     * @param target - the conversation to send it to.
     */
    async onScreenshot(target) {
        const screen = this.options.screen;
        if (!screen) {
            return await this.say(target, 'Las capturas están apagadas. Se activan en Ajustes → Telegram → Pantalla.');
        }
        const release = this.options.typing?.hold(target);
        try {
            const failure = await screen.send(target);
            if (failure !== undefined)
                await this.say(target, `⚠️ ${escapeHtml(failure)}`);
        }
        catch (error) {
            this.logger.error('[dsh-telegram] could not take a screenshot', error);
            await this.say(target, '⚠️ No se pudo tomar la captura.');
        }
        finally {
            release?.();
        }
    }
    /**
     * Everything about this conversation worth knowing in one message.
     *
     * The settings live behind four commands, and having to run all four to
     * answer "what am I actually talking to right now" is four commands too
     * many — especially the permission line, which is the one worth being sure
     * about before asking for something destructive.
     *
     * @param target - the conversation.
     */
    async describeConversation(target) {
        const rows = [...(await this.options.runner.status(target))];
        const models = this.options.models;
        if (models)
            rows.push({ label: 'Modelo', value: models.describe(target) });
        const effort = this.options.effort;
        if (effort)
            rows.push({ label: 'Esfuerzo', value: effort.describe(target) });
        const vision = this.options.vision;
        if (vision)
            rows.push({ label: 'Lee imágenes', value: vision.describe(target) });
        const permission = this.options.permission;
        if (permission)
            rows.push({ label: 'Permisos', value: permission.describe(target) });
        // Sent as markdown so Telegram draws it as a real table — since Bot API
        // 10.1 it parses these itself, which is the same path an agent's own
        // tables take. A deployment without the rich send falls back to lines.
        if (this.options.chat.sendRichMessage) {
            try {
                // Called as a method, not through a saved reference. Detaching it
                // loses `this`, and the client's own `this.call(...)` then throws —
                // which the catch below turns into a silent fall back to lines.
                await this.options.chat.sendRichMessage({
                    chatId: target.chatId,
                    markdown: statusTable(rows),
                    ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
                });
                return;
            }
            catch (error) {
                this.logger.warn('[dsh-telegram] could not send the status table', error);
            }
        }
        await this.say(target, rows
            .map((row) => `<b>${escapeHtml(row.label)}</b> <code>${escapeHtml(row.value)}</code>`)
            .join('\n'));
    }
    /**
     * Show or change how hard the model thinks before answering.
     *
     * The options come from the model itself: `low`/`medium`/`high` is one
     * provider's vocabulary rather than everyone's, and offering an effort a
     * model does not have would fail the turn instead of the command.
     *
     * @param target - the conversation.
     * @param args - what followed `/effort`.
     */
    async onEffort(target, args) {
        const effort = this.options.effort;
        if (!effort) {
            return await this.say(target, 'Esta instalación no permite cambiar el esfuerzo.');
        }
        const wanted = args.trim();
        const offered = await effort.options(target);
        if (offered.length === 0) {
            return await this.say(target, `<code>${escapeHtml(effort.model(target))}</code> no ofrece niveles de esfuerzo para elegir.`);
        }
        if (wanted === '') {
            const list = offered.map((option) => `• <code>${escapeHtml(option)}</code>`).join('\n');
            return await this.say(target, `🎚 <code>${escapeHtml(effort.describe(target))}</code>` +
                originNote(effort, target) +
                `\n\n${list}\n\nCambialo con <code>/effort high</code>.`);
        }
        if (wanted.toLowerCase() === 'default') {
            await effort.clear(target);
            return await this.say(target, `🎚 De vuelta a <code>${escapeHtml(effort.describe(target))}</code>.`);
        }
        const chosen = await effort.choose(target, wanted);
        if (chosen === undefined) {
            return await this.say(target, `⚠️ <code>${escapeHtml(effort.model(target))}</code> no tiene un esfuerzo llamado ` +
                `<code>${escapeHtml(wanted)}</code>. Ofrece: ${offered.join(', ')}.`);
        }
        return await this.say(target, `🎚 Va a pensar con <code>${escapeHtml(chosen)}</code> desde tu próximo mensaje.`);
    }
    /**
     * Show or change which model reads images for this conversation.
     *
     * `off` is a real answer rather than the absence of one: a conversation
     * whose own model can see wants no reader at all, and saying so has to
     * outrank whatever the deployment configured.
     *
     * @param target - the conversation.
     * @param args - what followed `/vision`.
     */
    async onVision(target, args) {
        const vision = this.options.vision;
        if (!vision) {
            return await this.say(target, 'Esta instalación no permite cambiar el lector de imágenes.');
        }
        const wanted = args.trim();
        if (wanted === '') {
            return await this.say(target, `👁 <code>${escapeHtml(vision.describe(target))}</code>` +
                originNote(vision, target) +
                '\n\nMirá lo configurado con <code>/model list</code>, cambialo con ' +
                '<code>/vision proveedor/modelo</code>, o apagalo con ' +
                '<code>/vision off</code>.');
        }
        if (OFF_WORDS.has(wanted.toLowerCase())) {
            await vision.disable(target);
            return await this.say(target, `👁 <code>${escapeHtml(vision.describe(target))}</code>` +
                originNote(vision, target) +
                '\n\nAhora las imágenes van a la conversación misma, que necesita un modelo que las lea.');
        }
        if (wanted.toLowerCase() === 'default') {
            await vision.clear(target);
            return await this.say(target, `👁 De vuelta a <code>${escapeHtml(vision.describe(target))}</code>.`);
        }
        const chosen = await vision.choose(target, wanted);
        switch (chosen.kind) {
            case 'route':
                return await this.say(target, `👁 Ahora las imágenes las lee <code>${escapeHtml(chosen.route)}</code>.`);
            case 'ambiguous':
                return await this.say(target, `Varios proveedores lo ofrecen. Elegí uno:\n${chosen.candidates
                    .map((candidate) => `• <code>${escapeHtml(candidate)}</code>`)
                    .join('\n')}`);
            default:
                return await this.say(target, `⚠️ Ningún modelo configurado se llama <code>${escapeHtml(wanted)}</code>. ` +
                    'Probá con <code>/model list</code>.');
        }
    }
    /**
     * Show or change what the agent is allowed to do here.
     *
     * Applied to the conversation in flight as well as recorded, because the
     * point of tightening it is usually the turn about to run.
     *
     * @param target - the conversation.
     * @param args - what followed `/permission`.
     */
    async onPermission(target, args) {
        const permission = this.options.permission;
        if (!permission) {
            return await this.say(target, 'Esta instalación no permite cambiar los permisos.');
        }
        const wanted = args.trim();
        const offered = permission.options();
        if (wanted === '') {
            const list = offered.map((option) => `• <code>${escapeHtml(option)}</code>`).join('\n');
            return await this.say(target, `🔐 <code>${escapeHtml(permission.describe(target))}</code>` +
                originNote(permission, target) +
                `\n\n${list}\n\nChange it with <code>/permission read-only</code>.`);
        }
        if (wanted.toLowerCase() === 'default') {
            await permission.clear(target);
            return await this.say(target, `🔐 Back to <code>${escapeHtml(permission.describe(target))}</code>.`);
        }
        const chosen = await permission.choose(target, wanted);
        if (chosen === undefined) {
            return await this.say(target, `⚠️ No hay ningún permiso llamado <code>${escapeHtml(wanted)}</code>. ` +
                `Esta instalación ofrece: ${offered.join(', ')}.`);
        }
        return await this.say(target, `🔐 Listo, ahora <code>${escapeHtml(chosen)}</code>.`);
    }
    /**
     * Show, list, or change the model this conversation talks to.
     *
     * No reset here, unlike `/cd`: the harness reads a mutable selection while
     * assembling each step, so a model change lands on the very next message and
     * the conversation carries on.
     *
     * @param target - the conversation.
     * @param args - what followed `/model`.
     */
    async onModel(target, args) {
        const models = this.options.models;
        if (!models) {
            return await this.say(target, 'Esta instalación no permite cambiar el modelo.');
        }
        const wanted = args.trim();
        if (wanted === '') {
            return await this.say(target, `🧠 <code>${escapeHtml(models.describe(target))}</code>` +
                originNote(models, target) +
                '\n\nMiralos con <code>/model list</code>, o cambialo con ' +
                '<code>/model proveedor/modelo</code>.');
        }
        if (wanted.toLowerCase() === 'default') {
            await models.clear(target);
            return await this.say(target, `🧠 De vuelta a <code>${escapeHtml(models.describe(target))}</code>.`);
        }
        if (wanted.toLowerCase() === 'list')
            return await this.say(target, await models.list());
        const chosen = await models.choose(target, wanted);
        switch (chosen.kind) {
            case 'route':
                return await this.say(target, `🧠 Ahora hablo con <code>${escapeHtml(chosen.route)}</code>.\n\n` +
                    'Se aplica desde tu próximo mensaje; esta conversación sigue igual.');
            case 'ambiguous':
                return await this.say(target, `Varios proveedores lo ofrecen. Elegí uno:\n${chosen.candidates
                    .map((candidate) => `• <code>${escapeHtml(candidate)}</code>`)
                    .join('\n')}`);
            default:
                return await this.say(target, `⚠️ Ningún modelo configurado se llama <code>${escapeHtml(wanted)}</code>. ` +
                    'Probá con <code>/model list</code>.');
        }
    }
    /**
     * Show or change the conversation's working directory.
     *
     * Changing it necessarily starts a fresh conversation: the sandbox derives
     * its writable root from the session's cwd, and that root is fixed when the
     * session opens. Rather than fail a move the user reasonably expects to
     * work, the reset is done for them and said out loud.
     *
     * @param target - the conversation.
     * @param args - what followed `/cd`; empty means "tell me where I am".
     */
    async onChangeDirectory(target, args) {
        const workspace = this.options.workspace;
        const current = workspace?.current(target);
        if (!workspace || current === undefined) {
            return await this.say(target, 'Esta instalación no permite cambiar la carpeta.');
        }
        if (args.trim() === '') {
            return await this.say(target, `📁 <code>${escapeHtml(current)}</code>\n\nCambiala con <code>/cd ~/proyectos/app</code>.`);
        }
        const wanted = workspace.resolve(args, current);
        if (wanted === undefined) {
            return await this.say(target, 'Decime una carpeta: <code>/cd ~/proyectos/app</code>');
        }
        if (wanted === current) {
            return await this.say(target, `Ya estoy en <code>${escapeHtml(wanted)}</code>.`);
        }
        const verdict = await workspace.inspect(wanted);
        if (verdict !== 'directory') {
            const why = verdict === 'file'
                ? 'eso es un archivo, no una carpeta'
                : verdict === 'denied'
                    ? 'no se puede leer'
                    : 'esa carpeta no existe';
            return await this.say(target, `⚠️ No puedo usar <code>${escapeHtml(wanted)}</code> — ${why}.`);
        }
        try {
            await workspace.set(target, wanted);
        }
        catch (error) {
            this.logger.error('[dsh-telegram] could not record the working directory', error);
            return await this.say(target, '⚠️ No se pudo guardar la carpeta.');
        }
        // After the directory is recorded, so a failed reset still leaves the
        // choice in place for the next message rather than losing it silently.
        await this.options.runner.reset(target);
        return await this.say(target, `📁 Ahora trabajo en <code>${escapeHtml(wanted)}</code>.\n\n` +
            '🆕 Empecé una conversación nueva — cada conversación conserva la carpeta donde abrió.');
    }
    /**
     * Whether this conversation's own model reads images.
     *
     * Never fatal: an unanswerable question here means the refusal is decided
     * the way it was before there was a model that could see.
     */
    async modelSees(target) {
        try {
            return (await this.options.modelSees?.(target)) === true;
        }
        catch {
            return false;
        }
    }
    /** Send one plain notice into a conversation, swallowing delivery failures. */
    async say(target, html) {
        try {
            await this.options.chat.sendMessage({
                chatId: target.chatId,
                html,
                ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
            });
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not deliver a notice', error);
        }
    }
}
/** Whether a message carries anything beyond its text. */
function hasMedia(message) {
    return Boolean(message.photo || message.document || message.voice || message.audio || message.video);
}
/** The conversation a message belongs to. */
function targetOf(message) {
    return {
        chatId: String(message.chat.id),
        ...(message.message_thread_id !== undefined ? { threadId: message.message_thread_id } : {}),
    };
}
//# sourceMappingURL=router.js.map