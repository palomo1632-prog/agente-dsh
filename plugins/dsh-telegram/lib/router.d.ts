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
import type { AccessPolicy } from './access.js';
import type { ChatTarget } from './interact/surface.js';
import type { TextCapture } from './interact/text-capture.js';
import type { Logger } from './harness/types.js';
import type { MediaCollector, PromptPart } from './media/collect.js';
import type { VoiceTranscriber } from './media/voice.js';
import type { TelegramUpdate } from './telegram/types.js';
import type { StatusRow } from './session/runner.js';
/** What the router needs to drive a conversation's agent. */
export interface AgentRunner {
    /** Deliver a prompt, starting or resuming the chat's session as needed. */
    prompt(target: ChatTarget, content: readonly PromptPart[]): Promise<void>;
    /** Forget the current session so the next prompt opens a fresh one. */
    reset(target: ChatTarget): Promise<void>;
    /** Cancel the in-flight turn; resolves to whether anything was running. */
    stop(target: ChatTarget): Promise<boolean>;
    /** What this conversation is, as rows the caller renders. */
    status(target: ChatTarget): Promise<StatusRow[]>;
}
/** The bits of the Bot API the router itself uses. */
export interface RouterChat {
    sendMessage(options: {
        chatId: string;
        html: string;
        threadId?: number;
    }): Promise<unknown>;
    answerCallbackQuery(id: string, text?: string): Promise<void>;
    /**
     * Post markdown for Telegram to render. Absent on a deployment below Bot API
     * 10.1, where a table would arrive as pipes and dashes.
     */
    sendRichMessage?(options: {
        chatId: string;
        markdown: string;
        threadId?: number;
    }): Promise<{
        messageId: number;
    }>;
}
/**
 * The conversation's working directory, and how to change it.
 *
 * Narrowed to what the router needs so `/cd` is testable without a filesystem:
 * `inspect` is the only call that touches disk.
 */
export interface WorkspaceControl {
    /** The directory this conversation's next session will open in. */
    current(target: ChatTarget): string;
    /** Work out which directory an argument names; undefined when it names none. */
    resolve(input: string, current: string): string | undefined;
    /** What is actually at that path. */
    inspect(directory: string): Promise<'directory' | 'file' | 'missing' | 'denied'>;
    /** Remember it for this conversation. */
    set(target: ChatTarget, directory: string): Promise<void>;
}
/**
 * The conversation's model, and how to change it.
 *
 * Narrowed to what the router needs, so `/model` is testable without a
 * provider catalog behind it.
 */
export interface ModelControl {
    /**
     * What lies underneath this conversation's choice, when it has made one.
     *
     * Two surfaces show related state — this command and the settings page —
     * and neither used to admit the other existed. Saying which layer is
     * answering is what stops the page looking like it is lying.
     */
    origin?(target: ChatTarget): string | undefined;
    /** The route in force, rendered the way it is typed back in. */
    describe(target: ChatTarget): string;
    /** Every configured provider and model, as Telegram HTML. */
    list(): Promise<string>;
    /** Take a user's words and, when they name one model, adopt it. */
    choose(target: ChatTarget, input: string): Promise<{
        kind: 'route';
        route: string;
    } | {
        kind: 'ambiguous';
        candidates: readonly string[];
    } | {
        kind: 'unknown';
    }>;
    /** Return the conversation to the deployment's own model. */
    clear(target: ChatTarget): Promise<void>;
}
/** The conversation's reasoning effort, and how to change it. */
export interface EffortControl {
    /**
     * What lies underneath this conversation's choice, when it has made one.
     *
     * Two surfaces show related state — this command and the settings page —
     * and neither used to admit the other existed. Saying which layer is
     * answering is what stops the page looking like it is lying.
     */
    origin?(target: ChatTarget): string | undefined;
    /** The effort in force, in words. */
    describe(target: ChatTarget): string;
    /** The model it belongs to, for naming it in a refusal. */
    model(target: ChatTarget): string;
    /** What that model offers; empty when it offers no choice. */
    options(target: ChatTarget): Promise<readonly string[]>;
    /** Adopt one, or undefined when the words name none. */
    choose(target: ChatTarget, input: string): Promise<string | undefined>;
    /** Return the conversation to the model's own default. */
    clear(target: ChatTarget): Promise<void>;
}
/** The model that reads images for this conversation, and how to change it. */
export interface VisionControl {
    /**
     * What lies underneath this conversation's choice, when it has made one.
     *
     * Two surfaces show related state — this command and the settings page —
     * and neither used to admit the other existed. Saying which layer is
     * answering is what stops the page looking like it is lying.
     */
    origin?(target: ChatTarget): string | undefined;
    /** The reader in force, in words. */
    describe(target: ChatTarget): string;
    /** Adopt one, or say why the words named none. */
    choose(target: ChatTarget, input: string): Promise<{
        kind: 'route';
        route: string;
    } | {
        kind: 'ambiguous';
        candidates: readonly string[];
    } | {
        kind: 'unknown';
    }>;
    /** Read images with nothing — the conversation's own model must cope. */
    disable(target: ChatTarget): Promise<void>;
    /** Return the conversation to whatever the deployment configured. */
    clear(target: ChatTarget): Promise<void>;
}
/** What the agent may do here, and how to change it. */
export interface PermissionControlSeam {
    /**
     * What lies underneath this conversation's choice, when it has made one.
     *
     * Two surfaces show related state — this command and the settings page —
     * and neither used to admit the other existed. Saying which layer is
     * answering is what stops the page looking like it is lying.
     */
    origin?(target: ChatTarget): string | undefined;
    /** The preset in force, in words. */
    describe(target: ChatTarget): string;
    /** Every preset the deployment defines. */
    options(): readonly string[];
    /** Adopt one, or undefined when the words name none. */
    choose(target: ChatTarget, input: string): Promise<string | undefined>;
    /** Return the conversation to the deployment's own preset. */
    clear(target: ChatTarget): Promise<void>;
}
/** What `/diag` reports. */
export interface DiagnosticsSource {
    report(): Promise<{
        /** Connection facts, as rows. */
        readonly status: readonly StatusRow[];
        /**
         * Which harness services this deployment actually composed.
         *
         * The most useful line in the report: a seam that is absent explains a
         * whole class of "why does it not do that" without anyone having to guess.
         */
        readonly seams: readonly {
            readonly name: string;
            readonly present: boolean;
        }[];
        readonly failures: readonly {
            at: string;
            level: string;
            message: string;
        }[];
    }>;
}
/** Capturing the screen and putting it in the chat. */
export interface ScreenControl {
    /**
     * Take one and send it.
     *
     * @returns undefined on success, or a sentence saying what went wrong.
     */
    send(target: ChatTarget): Promise<string | undefined>;
}
/** Shows that a conversation is being worked on, until released. */
export interface TypingHold {
    hold(target: ChatTarget): () => void;
}
/** Routes callback data to whichever feature owns it. */
export interface CallbackHandler {
    handleCallback(data: string | undefined): boolean;
}
/** Construction options. */
export interface UpdateRouterOptions {
    readonly chat: RouterChat;
    readonly access: AccessPolicy;
    readonly questions: CallbackHandler;
    readonly approvals: CallbackHandler;
    /** Owns the button that starts a fresh conversation after a stuck turn. */
    readonly recovery?: CallbackHandler;
    /**
     * Keeps Telegram's own indicator alive while the bot works. Absent simply
     * leaves the chat quiet until the reply arrives.
     */
    readonly typing?: TypingHold;
    /** Absent leaves every conversation in the configured directory. */
    readonly workspace?: WorkspaceControl;
    /** Absent leaves every conversation on the deployment's model. */
    readonly models?: ModelControl;
    /**
     * Whether this conversation's model accepts images itself. Absent decides
     * refusals the way they were decided before any model could see.
     */
    readonly modelSees?: (target: ChatTarget) => Promise<boolean>;
    /** Offers this chat's earlier conversations. Absent makes `/new` one-way. */
    readonly sessions?: CallbackHandler & {
        offer(target: ChatTarget): Promise<void>;
    };
    /** Absent leaves every conversation on the model's own reasoning effort. */
    readonly effort?: EffortControl;
    /** Absent leaves every conversation on the deployment's permission preset. */
    readonly permission?: PermissionControlSeam;
    /** Absent leaves every conversation on the deployment's image reader. */
    readonly vision?: VisionControl;
    /** Takes and sends a picture of the screen. Absent means screenshots are off. */
    readonly screen?: ScreenControl;
    /** What the plugin can see about itself, for `/diag`. */
    readonly diagnostics?: DiagnosticsSource;
    readonly textCapture: TextCapture;
    readonly runner: AgentRunner;
    /**
     * How long to wait for the rest of an album. Injected so tests need no clock.
     */
    readonly albumWindowMs?: number;
    /**
     * Turns a message's attachments into prompt content. Absent leaves the bot
     * text-only, which is what it was before media was wired up.
     */
    readonly media?: MediaCollector;
    /** Optional voice-note reader; absence retains the existing refusal. */
    readonly voice?: VoiceTranscriber;
    /**
     * This bot's own user id, so a reply to something it said is recognised as
     * addressing it. A group conversation continues that way rather than by
     * @mentioning the bot on every line.
     */
    readonly botId?: number;
    /**
     * Whether a group message must address the bot to be answered. Off makes the
     * bot answer every allowlisted message in the room, which is the older
     * behaviour and rarely what anyone wants.
     */
    readonly requireAddressing?: boolean;
    /** This bot's username, so `/cmd@other_bot` is left alone in groups. */
    readonly botUsername?: string;
    /**
     * Strips secrets from anything posted back into a chat. Agent failures are
     * reported to the user verbatim, and an error raised deep in a provider can
     * quote a credential it was given.
     */
    readonly redact?: (text: string) => string;
    readonly logger?: Logger;
}
export declare class UpdateRouter {
    private readonly options;
    /**
     * Albums still arriving, if this deployment reads attachments at all.
     *
     * Owned here rather than injected because its whole job is to defer part of
     * this class's own work back to it.
     */
    private readonly albums;
    private readonly logger;
    constructor(options: UpdateRouterOptions);
    /** Stop waiting on albums still arriving — the plugin is unloading. */
    dispose(): void;
    /**
     * Handle one update. Never throws: a thrown handler would stop the poll loop.
     *
     * @param update - one raw update from `getUpdates`.
     */
    handle(update: TelegramUpdate): Promise<void>;
    /** A button press: acknowledge first, then route it. */
    private onCallback;
    /** An incoming message: access, pending prompt, command, then prompt. */
    private onMessage;
    /**
     * Handle a whole album as one message.
     *
     * Access and addressing were already decided for each part as it arrived, so
     * what is left is the part a single photo would have taken.
     *
     * @param messages - the album's parts, in the order they were sent.
     */
    private onAlbum;
    /**
     * A user who may not drive the agent. An unclaimed bot still accepts
     * `/claim`, because that is the only way it ever becomes usable.
     */
    private onUnauthorized;
    /** Run one command. */
    private onCommand;
    /** Hand a prompt to the agent, reporting a failure into the chat. */
    private runPrompt;
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
    private onDiagnostics;
    /**
     * Send a picture of the screen the harness is running on.
     *
     * @param target - the conversation to send it to.
     */
    private onScreenshot;
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
    private describeConversation;
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
    private onEffort;
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
    private onVision;
    /**
     * Show or change what the agent is allowed to do here.
     *
     * Applied to the conversation in flight as well as recorded, because the
     * point of tightening it is usually the turn about to run.
     *
     * @param target - the conversation.
     * @param args - what followed `/permission`.
     */
    private onPermission;
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
    private onModel;
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
    private onChangeDirectory;
    /**
     * Whether this conversation's own model reads images.
     *
     * Never fatal: an unanswerable question here means the refusal is decided
     * the way it was before there was a model that could see.
     */
    private modelSees;
    /** Send one plain notice into a conversation, swallowing delivery failures. */
    private say;
}
//# sourceMappingURL=router.d.ts.map