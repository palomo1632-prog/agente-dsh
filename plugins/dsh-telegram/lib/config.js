/**
 * Plugin configuration.
 *
 * The bot token is deliberately absent. Configuration carries a *reference* to
 * the credential (`tokenRef`), and the value lives with the harness credential
 * provider — so a profile config stays safe to read, sync, and show in a UI,
 * and rotating the token touches no file here.
 */
import Schema from '@deepseek-ai/schemastery';
/** Default credential reference for the bot token. */
export const DEFAULT_TOKEN_REF = 'TELEGRAM_BOT_TOKEN';
export const Config = Schema.object({
    enabled: Schema.boolean()
        .default(true)
        .description('Whether the Telegram connection starts with the harness.'),
    tokenRef: Schema.string()
        .default(DEFAULT_TOKEN_REF)
        .description('Credential reference holding the bot token — never the token itself.'),
    baseUrl: Schema.string()
        .default('https://api.telegram.org')
        .description('Bot API origin; change it only for a local proxy.'),
    allowFrom: Schema.array(Schema.number())
        .default([])
        .description('Telegram user ids allowed to drive the agent. Leave empty to claim the bot once with /claim.'),
    cwd: Schema.string().description('Working directory new conversations start in. Defaults to the harness working directory.'),
    timeoutMs: Schema.natural().default(30_000).description('Per-request Bot API timeout.'),
    longPollSeconds: Schema.natural()
        .default(25)
        .description('How long Telegram holds an empty poll open.'),
    streaming: Schema.object({
        enabled: Schema.boolean()
            .default(true)
            .description('Edit one message as the answer streams, instead of sending it once at the end.'),
        throttleMs: Schema.natural()
            .default(1200)
            .description('Minimum gap between edits; Telegram rate-limits rapid edits to one chat.'),
    }),
    media: Schema.object({
        enabled: Schema.boolean()
            .default(true)
            .description('Read images and text files the user sends.'),
        maxBytes: Schema.natural()
            .default(20 * 1024 * 1024)
            .description('Refuse anything larger. Telegram caps bot downloads at 20 MB.'),
        maxTextChars: Schema.natural()
            .default(60_000)
            .description('Truncate an inlined text file to this many characters.'),
        speech: Schema.object({
            enabled: Schema.boolean().default(false).description('Transcribe Telegram voice notes before sending them to the agent.'),
            endpoint: Schema.string().default('').description('Speech-to-text HTTP transcription endpoint.'),
            tokenRef: Schema.string().default('').description('Credential reference for the speech-to-text bearer token.'),
            timeoutMs: Schema.natural().default(120_000).description('Maximum time to wait for one transcription.'),
            maxBytes: Schema.natural().default(8 * 1024 * 1024).description('Largest voice note sent to speech-to-text.'),
            maxSeconds: Schema.natural().default(45).description('Longest voice note sent to speech-to-text.'),
        }),
        ocr: Schema.object({
            enabled: Schema.boolean()
                .default(true)
                .description('Read an image\'s text with tesseract when no vision model is ' +
                'configured, or when the one configured could not be reached. Does ' +
                'nothing unless tesseract is installed, which no operating system ' +
                'does by default. It reads text and does not see: a diagram or a ' +
                'chart comes back as scattered words.'),
            languages: Schema.string()
                .default('eng')
                .description('Languages to read, as tesseract names them; join several with +, ' +
                'as in eng+ind. Only languages installed on this machine work — ' +
                '`tesseract --list-langs` says which.'),
        }),
        visionModel: Schema.string()
            .default('')
            .description('Model that reads an image, as provider/model. The picture goes to a ' +
            'session of its own there and only what it says joins the conversation. ' +
            'Empty sends the image to the conversation itself, which must then accept it.'),
    }),
    agentPreset: Schema.string()
        .default('')
        .description('Agent preset Telegram conversations are composed from — the roster in ' +
        'Settings owns the list. Empty takes the deployment default. The preset ' +
        'is what supplies the tools, so this decides what the agent can do.'),
    requireMentionInGroups: Schema.boolean()
        .default(true)
        .description('In a group, answer only when the bot is @mentioned or replied to. Off ' +
        'answers every message from an allowed user, which is rarely wanted in ' +
        'a room where people also talk to each other. Private chats are never ' +
        'affected.'),
    permissionPreset: Schema.string()
        .default('')
        .description('Permission preset Telegram conversations run under — one of the names ' +
        'the deployment defines. Empty follows the deployment default. A preset ' +
        'whose approval policy asks is what makes the approval buttons appear.'),
    screenshot: Schema.object({
        enabled: Schema.boolean()
            .default(false)
            .description('Allow /screenshot. Off by default: a screen holds whatever happens to ' +
            'be on it, and this is the one thing here that sends the machine\'s ' +
            'own contents outward without the agent being involved. macOS also ' +
            'needs Screen Recording permission for the harness process.'),
    }),
    reconnect: Schema.object({
        baseDelayMs: Schema.natural().default(1000).description('First reconnect delay.'),
        maxDelayMs: Schema.natural().default(30_000).description('Longest reconnect delay.'),
    }),
});
//# sourceMappingURL=config.js.map