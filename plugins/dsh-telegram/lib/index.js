/**
 * dsh-telegram — a Telegram front end for DeepSeek Harness.
 *
 * Two things this plugin does that a plain channel bridge does not:
 *
 * 1. **The agent's markdown arrives as markdown.** Replies are rendered to
 *    Telegram HTML and sent with `parse_mode`, so bold is bold and a code
 *    block is a code block — including while the answer is still streaming.
 * 2. **Questions and approvals can be answered from the chat.** The plugin
 *    registers a `ctx.userQuestions` provider and answers the
 *    `approval/request` waterfall, so `ask_user_question` and a tool that
 *    needs consent both become buttons in Telegram instead of a stall that
 *    only a browser can clear.
 *
 * Everything here is wiring. The behaviour lives in the modules below, each
 * testable without a harness; this file is the single place that touches the
 * live `ctx`.
 */
import { homedir } from 'node:os';
import { stat } from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AccessPolicy } from './access.js';
import { commandMenu } from './commands.js';
import { StatusFile, describeError } from './diagnostics.js';
import { SecretRegistry } from './secrets.js';
import { Config } from './config.js';
import { TelegramApprovalAnswerer } from './interact/approvals.js';
import { PendingRegistry } from './interact/pending.js';
import { TelegramQuestionProvider } from './interact/questions.js';
import { telegramSurface } from './interact/surface.js';
import { TextCapture } from './interact/text-capture.js';
import { TurnBridge } from './reply/turn-bridge.js';
import { canStreamTo } from './reply/rich-stream.js';
import { UpdateRouter } from './router.js';
import { escapeHtml } from './render/escape.js';
import { BindingStore } from './session/bindings.js';
import { RecoveryOffer } from './session/recovery.js';
import { SessionRunner } from './session/runner.js';
import { PermissionControl, matchPreset } from './session/permission.js';
import { PHOTO_LIMIT_BYTES, Screenshotter } from './media/screenshot.js';
import { FailureLog, recordingLogger } from './failures.js';
import { VersionCheck } from './versions.js';
import { ChatHistory } from './session/history.js';
import { SessionPicker } from './session/picker.js';
import { isUsableDirectory, resolveDirectory } from './session/workspaces.js';
import { ChatPreferences } from './session/preferences.js';
import { effortsFor, formatRoute, listCatalog, matchEffort, matchRoute } from './session/models.js';
import { TelegramApi, TelegramApiError } from './telegram/api.js';
import { UpdatePoller } from './telegram/poller.js';
import { createAgentHost } from './harness/host.js';
import { TypingIndicator } from './telegram/typing.js';
import { VisionExtractor } from './media/extractor.js';
import { OcrReader } from './media/ocr.js';
import { MediaCollector } from './media/collect.js';
import { isSafeSpeechEndpoint, TelegramVoiceTranscriber } from './media/voice.js';
import { VisionCheck, acceptsImages } from './media/vision.js';
import { buildUserMessage } from './harness/message.js';
import { installModelSelection, parseRoute } from './harness/model-selection.js';
import { installQuestionProvider } from './harness/questions-seam.js';
export { Config };
/** Cordis plugin name; the package name, which is also the module id. */
export const name = '@sympoies/dsh-telegram';
/**
 * Settings namespace this plugin owns. The browser half binds the same string,
 * which is the only thing pairing the two halves together.
 */
export const SETTINGS_NAMESPACE = 'telegram';
/**
 * Hard requirements only. Cordis reads this as a flat list of service names —
 * an object form would be read as services literally named after its keys — so
 * the interactive seams are bound inside `apply` with `ctx.inject()` instead.
 * That is what lets the plugin load on a profile that provides neither.
 */
export const inject = ['agents', 'credentials'];
/**
 * Load the plugin.
 *
 * @param ctx - the cordis context.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx, config) {
    // Wrapped rather than replaced: whatever sink the deployment composed still
    // gets everything, and this keeps a copy of the parts worth looking back at.
    // Several profiles compose no sink at all, which is how this plugin's faults
    // came to be found by noticing odd behaviour in a chat rather than by
    // reading a log.
    // One registry for the plugin's lifetime, created first because everything
    // written after it — files, log lines, chat messages — passes through it.
    const secrets = new SecretRegistry();
    const failures = new FailureLog({
        file: join(dataDirectory(), 'failures.json'),
        redact: secrets.redactor(),
    });
    const logger = recordingLogger(ctx.logger('dsh-telegram'), failures);
    let live = config;
    let abort;
    const status = new StatusFile(join(dataDirectory(), 'status.json'), secrets.redactor());
    /** (Re)open the connection under the configuration standing right now. */
    const run = () => {
        abort?.abort();
        abort = new AbortController();
        const signal = abort.signal;
        void start(ctx, live, logger, signal, status, secrets, failures).catch((error) => {
            if (signal.aborted)
                return;
            logger.error('[dsh-telegram] failed to start', error);
            void status.publish('failed', { detail: describeError(error) });
        });
    };
    ctx.effect(() => {
        run();
        return () => abort?.abort();
    }, 'dsh-telegram: connection');
    // Registering the namespace is what puts this plugin in front of a
    // configuration UI at all, and it happens even when the plugin is disabled —
    // otherwise the one screen that could re-enable it would have nothing to
    // show.
    //
    // Bound through ctx.inject rather than read with ctx.get: a settings provider
    // that composes after this entry would leave a get() empty, and the page
    // would show an empty namespace forever. A profile with no provider never
    // runs this, and the composed config stays the only source.
    ctx.inject(['settings'], (scope) => {
        const settings = scope.get('settings');
        if (!settings)
            return;
        scope.effect(() => {
            // A configuration surface that cannot bind must never take the bot
            // offline with it — the connection is the point, the settings page is a
            // convenience — so a failed registration is reported and stepped over.
            // DSH 0.2.0 removed the imperative settings.register: SettingsForms
            // projects every profile entry's Config schema into a form on its own
            // and writes an edit back through the loader, so there is no namespace
            // handle to hold or watch here — and the fields stay editable in
            // Settings without a custom page. (Older harnesses keep the path below.)
            if (typeof settings.register !== 'function') {
                logger.info('[dsh-telegram] settings are owned by the harness form (dsh 0.2.0 API)');
                return () => undefined;
            }
            let bound;
            try {
                bound = settings.register(SETTINGS_NAMESPACE, Config, { base: config });
            }
            catch (error) {
                logger.error('[dsh-telegram] could not register the settings namespace', error);
                void status.publish('failed', {
                    detail: `settings namespace unavailable: ${describeError(error)}`,
                });
                return () => undefined;
            }
            // The resolved value may already differ from the composed one — a user
            // document was loaded before this ran — so adopt it before watching.
            // Reconnecting only when it actually differs matters: with no user
            // overrides the resolved value IS the composed one, and reopening then
            // would cost every boot a second connection for nothing.
            const resolved = bound.get();
            if (resolved !== undefined && !sameJson(resolved, live)) {
                live = resolved;
                run();
            }
            // Every setting here shapes the connection — the token it opens, who may
            // use it, how replies are streamed — so a change reopens it rather than
            // leaving half the new configuration unapplied until the next boot. The
            // cost is one aborted long poll.
            return bound.watch((next) => {
                live = next;
                logger.info('[dsh-telegram] configuration changed; reconnecting');
                run();
            });
        }, 'dsh-telegram: settings namespace');
    });
}
/**
 * Bring the whole plugin up: resolve the token, wire the pieces, and poll.
 *
 * An unconfigured token is not an error — a profile may carry this plugin
 * without a bot yet. It logs how to configure one and stays idle.
 */
async function start(ctx, config, logger, signal, status, secrets, failures) {
    if (!config.enabled) {
        logger.info('[dsh-telegram] disabled; not connecting');
        await status.publish('idle', { detail: 'disabled in configuration' });
        return;
    }
    await status.publish('connecting');
    const token = await resolveToken(ctx, config.tokenRef);
    if (!token) {
        const detail = `credential "${config.tokenRef}" is not set. ` +
            'Creá un bot con @BotFather y guardá su token en esa referencia.';
        logger.warn(`[dsh-telegram] ${detail} The bot is idle.`);
        await status.publish('idle', { detail });
        return;
    }
    secrets.protect(token);
    const api = new TelegramApi({
        token,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
    });
    const me = await openConnection(api, config, logger, signal, status);
    if (!me)
        return;
    const home = dataDirectory();
    const bindings = await BindingStore.open(join(home, 'bindings.json'));
    const claimCode = randomUUID().slice(0, 8);
    const claimCodeFile = join(home, 'claim-code.txt');
    const access = await AccessPolicy.open(join(home, 'owner.json'), {
        allowFrom: config.allowFrom,
        claimCode,
        claimCodeFile,
    });
    announceAccess(access, config, claimCode, claimCodeFile, me.username, logger);
    // Published once per connection rather than per message: the menu is a
    // property of the bot, not of a chat, and Telegram remembers it.
    void api.setMyCommands(commandMenu(access.owner() === undefined && config.allowFrom.length === 0));
    const surface = telegramSurface(api);
    const pending = new PendingRegistry();
    const textCapture = new TextCapture();
    const targetOf = (sessionId) => bindings.forSession(sessionId);
    const questions = new TelegramQuestionProvider({
        surface,
        pending,
        targetOf,
        readText: (target, abortSignal) => textCapture.next(target, abortSignal),
    });
    const approvals = new TelegramApprovalAnswerer({ surface, pending, targetOf });
    const recovery = new RecoveryOffer({ surface, pending, targetOf, reset: (target) => runner.reset(target) }, logger);
    // One indicator for the whole plugin: the router's hold over reading an
    // attachment and the bridge's hold over the turn it starts overlap, and both
    // must let go before the chat stops typing.
    const typing = new TypingIndicator({ chat: api });
    const turns = new TurnBridge({
        chat: api,
        targetOf,
        typing,
        canDraft: (chat) => canStreamTo(chat.chatId, config.streaming.enabled),
        throttleMs: config.streaming.throttleMs,
        onFailure: (sessionId, failure) => void recovery.offer(sessionId, failure),
        logger,
    });
    // Without this the agent joins no preset, and almost every model-facing tool
    // — bash, the editor, grep, skills, subagents — is registered into a
    // preset's scope layer rather than the host's. A Telegram agent then reached
    // the model with only the globally registered web tools, and answered "I
    // cannot run shell commands from this session".
    const presets = ctx.get('agentPresets');
    if (!presets) {
        logger.info('[dsh-telegram] no agent preset roster; using the host composition alone');
    }
    const host = createAgentHost({
        agents: ctx.agents,
        message: buildUserMessage,
        selectModel: () => selectModel(ctx, logger),
        installSelection: installModelSelection,
        ...(presets ? { presets } : {}),
        // Read late, so a preset chosen in the settings document reaches the next
        // conversation rather than the next restart.
        presetId: () => config.agentPreset || undefined,
        logger,
    });
    const cwd = config.cwd || process.cwd();
    // Kept apart from the bindings deliberately: a binding dies with `/new`,
    // while the directory a person chose belongs to the chat and must outlive it.
    const workspaces = await ChatPreferences.open(join(home, 'workspaces.json'), {
        accept: isUsableDirectory,
    });
    const cwdFor = (target) => workspaces.forChat(target) ?? cwd;
    // Shares the host with the runner so a reading runs on the same harness the
    // conversation does — but never in the conversation's own session.
    // Never assumed: tesseract ships with no operating system this runs on, so
    // its absence is the ordinary case. Probed once, and simply reads nothing
    // where it is missing.
    const ocr = config.media.ocr.enabled
        ? new OcrReader({ languages: config.media.ocr.languages, logger })
        : undefined;
    const extractor = new VisionExtractor({
        host,
        cwd,
        visionModel: () => parseRoute(config.media.visionModel),
        ...(ocr ? { fallback: ocr } : {}),
        ...(attachmentStore(ctx) ? { attachments: attachmentStore(ctx) } : {}),
        logger,
    });
    // The deployment's default is chosen for the surface the operator sits in
    // front of. Telegram is not that surface, so it may choose its own.
    /**
     * The image reader a conversation chose.
     *
     * `off` is stored as a value rather than as an absence, because a
     * conversation that wants no reader has to outrank the deployment's own
     * setting — and "nothing stored" already means "follow the deployment".
     */
    const chosenVision = await ChatPreferences.open(join(home, 'vision.json'), {
        accept: (value) => value === VISION_OFF || parseRoute(value) !== undefined,
    });
    /** The model this conversation reads images with, if any. */
    const visionRouteFor = (target) => {
        const chosen = chosenVision.forChat(target);
        if (chosen === VISION_OFF)
            return undefined;
        return parseRoute(chosen ?? config.media.visionModel);
    };
    const chosenPermissions = await ChatPreferences.open(join(home, 'permissions.json'), {
        accept: (value) => value.trim() !== '',
    });
    const permission = new PermissionControl({
        ...(ctx.get('permissionPresets') ? { presets: ctx.get('permissionPresets') } : {}),
        ...(ctx.get('sessions') ? { sessions: ctx.get('sessions') } : {}),
        // A conversation's own choice outranks the plugin's setting, which in turn
        // outranks the deployment's default.
        preset: (target) => chosenPermissions.forChat(target) ?? config.permissionPreset ?? undefined,
        logger,
    });
    // Durable per chat, so a model chosen from a phone survives `/new` and a
    // restart. Validated on read as well as on write: a model configured
    // yesterday may be gone today.
    const chosenModels = await ChatPreferences.open(join(home, 'models.json'), {
        accept: (value) => parseRoute(value) !== undefined,
    });
    const chosenEfforts = await ChatPreferences.open(join(home, 'efforts.json'), {
        accept: (value) => value.trim() !== '',
    });
    /**
     * The route a conversation's next step should run on.
     *
     * An effort alone still needs a route to carry it, so it falls back to the
     * deployment's own model rather than being silently dropped.
     */
    const chosenRoute = (target) => {
        const model = parseRoute(chosenModels.forChat(target));
        const effort = chosenEfforts.forChat(target);
        const base = model ?? (effort === undefined ? undefined : selectModel(ctx, logger));
        if (!base)
            return undefined;
        return effort === undefined ? base : { ...base, reasoningEffort: effort };
    };
    // The llm service knows which models declare image input. Read before the
    // predicate below, which closes over it.
    const catalog = ctx.get('llm');
    /**
     * Whether the model a conversation runs on reads images itself.
     *
     * One question, two consumers: it decides whether an attachment is refused,
     * and whether the picture is read elsewhere before the conversation sees it.
     * Both used to judge the deployment default, which stopped being right the
     * moment a model that can see became selectable per conversation.
     */
    const modelSees = async (target) => {
        if (!catalog)
            return false;
        const route = chosenRoute(target) ?? selectModel(ctx, logger);
        if (!route)
            return false;
        try {
            const info = await catalog.resolveModelInfo(route.provider, route.model);
            return acceptsImages(info);
        }
        catch {
            return false;
        }
    };
    const history = await ChatHistory.open(join(home, 'history.json'));
    const runner = new SessionRunner({
        host,
        bindings,
        cwdFor,
        chosenRoute,
        modelSees,
        permission,
        history,
        extractor,
        visionRoute: visionRouteFor,
        logger,
    });
    // The llm service knows which models declare image input; without it the
    // check is skipped and the provider stays the authority.
    const vision = catalog
        ? new VisionCheck(catalog, () => 
        // The model an image would ACTUALLY run on, not the conversation's
        // default: judging the default would refuse every image the moment a
        // vision model was configured, which is the one case it exists for.
        parseRoute(config.media.visionModel) ?? selectModel(ctx, logger))
        : undefined;
    const media = config.media.enabled
        ? new MediaCollector({
            source: api,
            ...(vision ? { vision } : {}),
            // Absent on a deployment with no attachment seam; images are then
            // declined with a reason rather than silently dropped.
            ...(attachmentStore(ctx) ? { attachments: attachmentStore(ctx) } : {}),
            maxBytes: config.media.maxBytes,
            maxTextChars: config.media.maxTextChars,
            ...(ocr ? { canReadWithoutModel: () => ocr.available() } : {}),
            redact: secrets.redactor(),
            logger,
        })
        : undefined;
    const speech = config.media.speech;
    const safeSpeechEndpoint = speech.enabled && isSafeSpeechEndpoint(speech.endpoint);
    const speechToken = safeSpeechEndpoint && speech.tokenRef
        ? await resolveToken(ctx, speech.tokenRef)
        : undefined;
    secrets.protect(speechToken);
    const voice = speech.enabled
        ? speechToken && speech.endpoint
            ? new TelegramVoiceTranscriber({
                source: api,
                endpoint: speech.endpoint,
                token: speechToken,
                maxBytes: speech.maxBytes,
                maxSeconds: speech.maxSeconds,
                timeoutMs: speech.timeoutMs,
                signal,
            })
            : { transcribe: async () => ({ kind: 'failure', notice: 'El reconocimiento de voz no está configurado.' }) }
        : undefined;
    const sessionPicker = new SessionPicker({
        surface,
        pending,
        history,
        currentSession: (target) => bindings.forChat(target)?.sessionId,
        adopt: (target, sessionId) => runner.adopt(target, sessionId),
        logger,
    });
    const startedAt = Date.now();
    /**
     * Which harness services this deployment composed.
     *
     * The single most useful line in `/diag`: an absent seam explains a whole
     * class of "why does it not do that" without anyone having to guess. A
     * missing `agentPresets` is why Telegram agents once reached the model with
     * almost no tools, and nothing said so anywhere.
     */
    const seamReport = () => ['agents', 'agentPresets', 'permissionPresets', 'sessions', 'llm', 'attachments', 'userQuestions'].map((name) => ({ name, present: ctx.get(name) !== undefined }));
    // Answers "am I behind?" without any of the risk of acting on it: updating
    // the harness needs a restart, and restarting from inside it kills the
    // process answering you.
    const versions = new VersionCheck();
    const screenshotter = new Screenshotter({ logger });
    if (config.screenshot.enabled && !screenshotter.available) {
        logger.warn(`[dsh-telegram] /screenshot is on but ${process.platform} has no capture tool`);
    }
    const router = new UpdateRouter({
        chat: api,
        ...(voice ? { voice } : {}),
        access,
        questions,
        approvals,
        recovery,
        // Los comandos del harness (/compact, /goal, ...) no son de este plugin:
        // se le pasan al registro de comandos del agente y se contesta lo que diga.
        harnessCommand: async (target, line) => {
            const commands = ctx.get('commands');
            if (commands === undefined || typeof commands.execute !== 'function') {
                logger.warn('[dsh-telegram] no harness command registry is available');
                return undefined;
            }
            // runner.agentFor devuelve un envoltorio plano (sessionId/followup/cancel);
            // el registro de comandos está indexado por el agente del harness, así que
            // se resuelve ESE objeto desde su registro, después de asegurar que esté vivo.
            const running = await runner.agentFor(target);
            const agent = running === undefined ? undefined : ctx.agents.get(running.sessionId);
            if (agent === undefined) {
                logger.warn(`[dsh-telegram] ${line.split(' ')[0]}: no hay agente vivo para esta conversación`);
                return undefined;
            }
            const settled = await commands.execute(agent, line, [], new AbortController().signal);
            if (settled === undefined)
                logger.warn(`[dsh-telegram] el harness no conoce el comando ${line.split(' ')[0]}`);
            return settled?.result;
        },
        modelSees,
        ...(catalog
            ? {
                vision: {
                    describe: (target) => {
                        if (chosenVision.forChat(target) === VISION_OFF)
                            return 'nada — la conversación misma';
                        return formatRoute(visionRouteFor(target)) === 'el valor por defecto'
                            ? 'nada configurado'
                            : formatRoute(visionRouteFor(target));
                    },
                    origin: (target) => chosenVision.forChat(target) === undefined
                        ? undefined
                        : `este chat; el valor por defecto es ${config.media.visionModel || 'nada configurado'}`,
                    async choose(target, input) {
                        const providers = await listCatalog(catalog).catch(() => []);
                        const matched = matchRoute(input, providers);
                        if (matched.kind !== 'route')
                            return matched;
                        const route = `${matched.route.provider}/${matched.route.model}`;
                        await chosenVision.set(target, route);
                        return { kind: 'route', route };
                    },
                    disable: (target) => chosenVision.set(target, VISION_OFF),
                    clear: (target) => chosenVision.clear(target),
                },
            }
            : {}),
        sessions: sessionPicker,
        typing,
        diagnostics: {
            async report() {
                const uptime = Math.floor((Date.now() - startedAt) / 1000);
                return {
                    status: [
                        { label: 'Bot', value: me.username ? `@${me.username}` : String(me.id) },
                        { label: 'Plugin', value: await describeVersion(versions, PACKAGE_NAME, PLUGIN_VERSION) },
                        {
                            label: 'Sistema',
                            value: await describeVersion(versions, '@deepseek-ai/dsh', harnessVersion()),
                        },
                        { label: 'Encendido hace', value: formatUptime(uptime) },
                        { label: 'Respuesta en vivo', value: config.streaming.enabled ? 'sí' : 'no' },
                        { label: 'Adjuntos', value: config.media.enabled ? 'sí' : 'no' },
                        { label: 'Capturas', value: config.screenshot.enabled ? 'sí' : 'no' },
                        {
                            label: 'OCR',
                            value: ocr === undefined
                                ? 'no'
                                : (await ocr.available())
                                    ? `tesseract, ${config.media.ocr.languages}`
                                    : 'activado, pero falta tesseract',
                        },
                        { label: 'Grupos', value: config.requireMentionInGroups ? 'hay que mencionarlo' : 'abierto' },
                    ],
                    seams: seamReport(),
                    failures: failures.recent(),
                };
            },
        },
        ...(config.screenshot.enabled
            ? {
                screen: {
                    async send(target) {
                        const shot = await screenshotter.take();
                        if (shot.kind === 'unsupported') {
                            return `Las capturas todavía no funcionan en ${shot.platform}.`;
                        }
                        if (shot.kind === 'failed') {
                            return shot.reason === 'the harness has no Screen Recording permission'
                                ? 'macOS no le dio permiso de grabación de pantalla al sistema. ' +
                                    'Dalo en Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla, ' +
                                    'y reiniciá el bot.'
                                : `La captura falló: ${shot.reason}`;
                        }
                        // Over the photo limit it goes as a document, which Telegram
                        // takes up to 50 MB. A large display's PNG routinely is.
                        const asPhoto = shot.data.length <= PHOTO_LIMIT_BYTES;
                        await api.uploadFile(asPhoto ? 'sendPhoto' : 'sendDocument', asPhoto ? 'photo' : 'document', {
                            chatId: target.chatId,
                            data: shot.data,
                            filename: shot.filename,
                            contentType: 'image/png',
                            ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
                        });
                        return undefined;
                    },
                },
            }
            : {}),
        ...(permission.available
            ? {
                permission: {
                    describe: (target) => chosenPermissions.forChat(target) ?? (config.permissionPreset || 'el valor por defecto'),
                    origin: (target) => chosenPermissions.forChat(target) === undefined
                        ? undefined
                        : `este chat; si no, ${config.permissionPreset || 'el valor por defecto'}`,
                    options: () => permission.names,
                    async choose(target, input) {
                        const matched = matchPreset(input, permission.names);
                        if (matched === undefined)
                            return undefined;
                        await chosenPermissions.set(target, matched);
                        // Applied to the session in flight too: the reason to tighten it
                        // is usually the turn about to run, not the next conversation.
                        const live = bindings.forChat(target)?.sessionId;
                        if (live !== undefined)
                            permission.apply(target, live);
                        return matched;
                    },
                    async clear(target) {
                        await chosenPermissions.clear(target);
                        const live = bindings.forChat(target)?.sessionId;
                        if (live !== undefined)
                            permission.apply(target, live);
                    },
                },
            }
            : {}),
        ...(catalog
            ? {
                effort: {
                    describe: (target) => chosenEfforts.forChat(target) ?? "el valor propio del modelo",
                    origin: (target) => chosenEfforts.forChat(target) === undefined
                        ? undefined
                        : "este chat; si no, el valor propio del modelo",
                    model: (target) => formatRoute(chosenRoute(target) ?? selectModel(ctx, logger)),
                    async options(target) {
                        const reasoning = await effortsFor(catalog, chosenRoute(target) ?? selectModel(ctx, logger));
                        return (reasoning?.efforts ?? []).map((option) => option.id);
                    },
                    async choose(target, input) {
                        const reasoning = await effortsFor(catalog, chosenRoute(target) ?? selectModel(ctx, logger));
                        const matched = matchEffort(input, reasoning?.efforts ?? []);
                        if (matched === undefined)
                            return undefined;
                        await chosenEfforts.set(target, matched);
                        return matched;
                    },
                    clear: (target) => chosenEfforts.clear(target),
                },
                models: buildModelControl({
                    catalog: catalog,
                    store: chosenModels,
                    chosen: chosenRoute,
                    stored: (target) => chosenModels.forChat(target),
                    fallback: () => selectModel(ctx, logger),
                }),
            }
            : {}),
        workspace: {
            current: cwdFor,
            resolve: (input, current) => resolveDirectory(input, current, homedir()),
            inspect: inspectDirectory,
            set: (target, directory) => workspaces.set(target, directory),
        },
        textCapture,
        runner,
        ...(me.username ? { botUsername: me.username } : {}),
        botId: me.id,
        requireAddressing: config.requireMentionInGroups,
        ...(media ? { media } : {}),
        redact: secrets.redactor(),
        logger,
    });
    const teardown = [
        subscribeToTurns(ctx, turns, extractor),
        installQuestions(ctx, questions, logger),
        installApprovals(ctx, approvals),
    ];
    signal.addEventListener('abort', () => {
        for (const dispose of teardown)
            dispose();
        pending.dispose();
        router.dispose();
        void failures.flush();
        failures.dispose();
        typing.dispose();
        extractor.dispose();
        textCapture.dispose();
        recovery.dispose();
        void turns.dispose();
    }, { once: true });
    const poller = new UpdatePoller({
        source: api,
        onUpdate: (update) => router.handle(update),
        longPollSeconds: config.longPollSeconds,
        baseDelayMs: config.reconnect.baseDelayMs,
        maxDelayMs: config.reconnect.maxDelayMs,
        onConnected: () => {
            logger.info('[dsh-telegram] listening for messages');
            void status.publish('connected', { bot: me.username ?? String(me.id) });
        },
        logger,
    });
    await poller.run(signal);
}
/**
 * Verify the token and take the polling path, retrying until it works.
 *
 * The receive loop already survives a dropped network; startup did not, and
 * that asymmetry is what turns a momentary failure — a rate limit after a
 * quick restart, a DNS blip, a laptop still waking — into a bot that stays
 * silent until someone restarts the harness. Only a rejected token is final:
 * retrying that would hammer Telegram forever with a credential that cannot
 * become valid on its own.
 *
 * @returns the bot's identity, or undefined when the caller aborted.
 */
async function openConnection(api, config, logger, signal, status) {
    for (let attempt = 1; !signal.aborted; attempt += 1) {
        try {
            const me = await api.getMe();
            // getUpdates and webhooks are mutually exclusive; take the polling path.
            await api.deleteWebhook().catch((error) => {
                logger.warn('[dsh-telegram] could not clear an existing webhook', error);
            });
            logger.info(`[dsh-telegram] connected as @${me.username ?? me.id}`);
            await status.publish('connected', { bot: me.username ?? String(me.id) });
            return me;
        }
        catch (error) {
            if (signal.aborted)
                return undefined;
            if (error instanceof TelegramApiError && error.isAuthFailure) {
                const detail = `the bot token was rejected: ${error.description ?? 'unauthorized'}`;
                logger.error(`[dsh-telegram] ${detail}`);
                await status.publish('failed', { detail });
                return undefined;
            }
            const delay = Math.min(config.reconnect.baseDelayMs * 2 ** Math.min(attempt - 1, 8), config.reconnect.maxDelayMs);
            logger.warn(`[dsh-telegram] could not connect; retrying in ${delay}ms`, error);
            await status.publish('connecting', {
                detail: `attempt ${attempt} failed: ${describeError(error)}`,
            });
            await sleep(delay, signal);
        }
    }
    return undefined;
}
/** Cancellable pause between connection attempts. */
function sleep(ms, signal) {
    return new Promise((resolve) => {
        if (signal.aborted)
            return resolve();
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
/**
 * Stream every Telegram-bound session's turns into its chat.
 *
 * The same feed carries the throwaway sessions images are read in, and those
 * are claimed by the extractor first: they belong to no chat, and letting the
 * bridge see them would put a reading's own turn — and its failures — in front
 * of whoever sent the picture.
 */
function subscribeToTurns(ctx, turns, extractor) {
    return ctx.on('session/event', ((session, event) => {
        const sessionId = String(session.id);
        if (extractor.handle(sessionId, event))
            return;
        void turns.handle(sessionId, event);
    }));
}
/**
 * Install the question handler on the user-questions waterfall. Absent on a
 * profile that does not load the seam, in which case questions simply stay a
 * web-only feature rather than breaking the plugin.
 */
function installQuestions(ctx, provider, logger) {
    const fiber = ctx.inject(['userQuestions'], (scope) => {
        const service = scope.get('userQuestions');
        if (!service)
            return;
        scope.effect(() => {
            const seam = installQuestionProvider(scope, (request, next) => {
                const sessionId = request?.agent?.session?.id ?? request?.agent?.id;
                if (!provider.handles(sessionId))
                    return next();
                return provider.ask(request);
            }, logger);
            return () => seam.restore();
        }, 'dsh-telegram: user-questions provider');
    });
    return () => void fiber.dispose();
}
/**
 * Answer the approval waterfall for Telegram sessions.
 *
 * Registered with `prepend` so it is offered the request before the web UI's
 * listener, which claims any pending approval in the session regardless of
 * where the conversation is happening.
 */
function installApprovals(ctx, answerer) {
    const fiber = ctx.inject(['approval'], (scope) => {
        scope.on('approval/request', (async (request, next) => {
            const outcome = await answerer.decide(request);
            return outcome ?? (await next());
        }), true);
    });
    return () => void fiber.dispose();
}
/**
 * The deployment's current model route.
 *
 * Read through `ctx.get` at creation time rather than injected: the service is
 * optional in principle, and reading late means a default changed in Settings
 * applies to the next conversation without a reconnect.
 */
function selectModel(ctx, logger) {
    const service = ctx.get('agentDefaultModel');
    if (!service) {
        logger.warn('[dsh-telegram] no agentDefaultModel service: agents will be created without a model route, ' +
            'and every turn will fail while assembling its prompt');
        return undefined;
    }
    try {
        const selection = service.currentSelection();
        if (selection)
            return { provider: selection.provider, model: selection.model };
    }
    catch (error) {
        logger.warn('[dsh-telegram] could not read the default model selection', error);
    }
    return undefined;
}
/**
 * The harness attachment seam, when this deployment mounts one.
 *
 * Read late rather than injected: a profile without it should still run the
 * bot, declining images with a reason instead of failing to load.
 */
function attachmentStore(ctx) {
    return ctx.get('attachments');
}
/**
 * The `/model` seam, over the harness catalog and the durable choice.
 *
 * Assembled here rather than inside the router so the router stays testable
 * without a provider catalog, and so the rendering — which is Telegram HTML —
 * sits beside the other message building.
 */
function buildModelControl(options) {
    return {
        describe: (target) => formatRoute(options.chosen(target) ?? options.fallback()),
        origin: (target) => options.stored(target) === undefined
            ? undefined
            : `este chat; el valor por defecto es ${formatRoute(options.fallback())}`,
        async list() {
            let providers;
            try {
                providers = await listCatalog(options.catalog);
            }
            catch {
                return 'No pude leer los modelos configurados.';
            }
            if (providers.length === 0)
                return 'No hay modelos configurados. Agregá uno en Ajustes → Modelos.';
            return providers
                .map((provider) => {
                const rows = provider.models
                    .map((model) => `• <code>${escapeHtml(`${provider.id}/${model.id}`)}</code>`)
                    .join('\n');
                return `<b>${escapeHtml(provider.name ?? provider.id)}</b>\n${rows}`;
            })
                .join('\n\n');
        },
        async choose(target, input) {
            const providers = await listCatalog(options.catalog).catch(() => []);
            const matched = matchRoute(input, providers);
            if (matched.kind !== 'route')
                return matched;
            const route = `${matched.route.provider}/${matched.route.model}`;
            await options.store.set(target, route);
            return { kind: 'route', route };
        },
        clear: (target) => options.store.clear(target),
    };
}
/**
 * The harness's own version, read from the process that is running it.
 *
 * Derived rather than hard-coded: `process.argv[1]` is the script node was
 * given, which for the harness is its own bin — so walking up from there finds
 * the manifest the CLI's own `--version` reads. A plugin cannot simply import
 * `@deepseek-ai/dsh`: under pnpm's isolated layout it resolves only its own
 * declared dependencies, and the harness is the host's.
 *
 * @returns the version, or undefined when it cannot be worked out.
 */
function harnessVersion() {
    const entry = process.argv[1];
    if (entry === undefined)
        return undefined;
    try {
        let directory = dirname(realpathSync(entry));
        // Bounded: a walk that finds nothing must end, and no sane layout puts the
        // manifest further up than this.
        for (let depth = 0; depth < 5; depth += 1) {
            try {
                const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
                // Checked by name, so a nested manifest cannot be mistaken for it.
                if (manifest.name === '@deepseek-ai/dsh')
                    return manifest.version;
            }
            catch {
                // No manifest at this level; keep walking.
            }
            const parent = dirname(directory);
            if (parent === directory)
                break;
            directory = parent;
        }
    }
    catch {
        return undefined;
    }
    return undefined;
}
/**
 * This plugin's version, for a report that has to say which build is running.
 *
 * Read from the manifest rather than hard-coded, so it cannot drift from the
 * package it was published as.
 */
const { version: PLUGIN_VERSION, name: PACKAGE_NAME } = (() => {
    try {
        const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return {
            version: manifest.version ?? 'unknown',
            name: manifest.name ?? '@sympoies/dsh-telegram',
        };
    }
    catch {
        return { version: 'unknown', name: '@sympoies/dsh-telegram' };
    }
})();
/**
 * One version line: what is installed, and whether anything newer is published.
 *
 * Says nothing about the registry when it could not be reached, rather than
 * claiming a version is current on the strength of a failed request.
 */
async function describeVersion(versions, name, installed) {
    if (installed === undefined)
        return 'unknown';
    const report = await versions.check(name, installed);
    if (report.latest === undefined)
        return installed;
    return report.behind ? `${installed} → ${report.latest} available` : `${installed} (latest)`;
}
/** Stored where a conversation wants no image reader at all. */
const VISION_OFF = 'off';
/** Seconds as something readable at a glance. */
function formatUptime(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    return hours < 24 ? `${hours}h ${Math.floor((seconds % 3600) / 60)}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
/**
 * What is actually at a path the user named.
 *
 * Four answers rather than a boolean: "no such directory" and "that is a file"
 * are different mistakes, and a permission failure is neither — telling them
 * apart is the difference between a message someone can act on and one they
 * have to guess at.
 *
 * @param directory - an absolute path.
 */
async function inspectDirectory(directory) {
    try {
        return (await stat(directory)).isDirectory() ? 'directory' : 'file';
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT' || code === 'ENOTDIR')
            return 'missing';
        return 'denied';
    }
}
/** Resolve the bot token through the harness credential seam. */
async function resolveToken(ctx, ref) {
    try {
        const resolved = await ctx.credentials.resolve(ref);
        const value = resolved?.value;
        return value && value !== '' ? value : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Deep equality over JSON-shaped configuration.
 *
 * Written out rather than done with `JSON.stringify`, whose answer depends on
 * key order — two resolutions of the same schema need not agree on it, and a
 * false difference here costs a needless reconnection.
 */
function sameJson(a, b) {
    if (a === b)
        return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
        return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false;
        return a.every((item, index) => sameJson(item, b[index]));
    }
    const left = a;
    const right = b;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length)
        return false;
    return keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}
/**
 * Where this plugin keeps its bindings and ownership record.
 *
 * Deliberately not derived from the package name: renaming the package must
 * not orphan a bot's ownership record or the conversations bound to it.
 */
function dataDirectory() {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
    return join(home, 'dsh-telegram');
}
/**
 * Tell the operator, on their own console, how to reach the bot. The claim
 * code is printed here and nowhere else — it must never travel over Telegram,
 * because anyone who can read it can take the bot.
 */
function announceAccess(access, config, claimCode, claimCodeFile, username, logger) {
    if (config.allowFrom.length > 0) {
        logger.info(`[dsh-telegram] allowing ${config.allowFrom.length} configured user id(s)`);
        return;
    }
    const owner = access.owner();
    if (owner !== undefined) {
        logger.info(`[dsh-telegram] owned by Telegram user ${owner}`);
        return;
    }
    const handle = username ? `@${username}` : 'your bot';
    logger.warn(`[dsh-telegram] this bot has no owner yet. Message ${handle} with:\n\n    /claim ${claimCode}\n\n` +
        `Until then it answers nobody. The code changes on every restart, and is\n` +
        `also readable at ${claimCodeFile} in case this log is not.`);
}
//# sourceMappingURL=index.js.map