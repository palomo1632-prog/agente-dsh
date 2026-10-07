/**
 * One harness session per Telegram conversation.
 *
 * The lifecycle has three states and the transitions between them are the
 * whole job: a conversation with no session yet, one whose session is loaded
 * in this process, and one whose session exists only in the durable log
 * because the harness has restarted since.
 *
 * The third case is why `resume` exists and why a failed resume is not fatal.
 * A session log can be pruned, moved, or written by an incompatible version;
 * when it can no longer be loaded, the user gets a fresh conversation and a
 * note, which is far better than a bot that answers every message with the
 * same load error.
 *
 * The agent host is injected rather than reached for directly, so this logic
 * is exercised without a running harness.
 */
import type { ChatTarget } from '../interact/surface.js';
import type { PromptPart } from '../media/collect.js';
import type { ModelRoute } from '../harness/model-selection.js';
import type { AgentRunner } from '../router.js';
import type { Logger } from '../harness/types.js';
import type { BindingStore } from './bindings.js';
/** One line of a conversation's description. */
export interface StatusRow {
    readonly label: string;
    readonly value: string;
}
/** A live agent this plugin drives. */
export interface RunningAgent {
    readonly sessionId: string;
    /** Queue a user message and wake the driver. */
    followup(content: readonly PromptPart[]): void;
    /**
     * Route the next step onto another model, or back to the agent's own.
     *
     * @param route - the override, or undefined to drop it.
     * @returns whether the agent accepts an override at all; a borrowed agent,
     *   or a harness that offers no selection seam, does not.
     */
    useModel(route: ModelRoute | undefined): boolean;
    /** Cancel the in-flight turn and any queued work. */
    cancel(reason: string): void;
    /** Stop the agent and release its session. */
    dispose(): Promise<void>;
}
/** Creating and loading agents — the harness surface, narrowed. */
export interface AgentHost {
    /** The agent for a session if it is already loaded in this process. */
    live(sessionId: string): RunningAgent | undefined;
    /**
     * Start a new session and agent under `sessionId`.
     *
     * @param route - forces the model rather than taking the deployment's
     *   default. Used by the throwaway session an image is read in, which has to
     *   run somewhere that can see.
     */
    create(sessionId: string, cwd: string, route?: ModelRoute): Promise<RunningAgent>;
    /** Load a persisted session; undefined when it can no longer be loaded. */
    resume(sessionId: string): Promise<RunningAgent | undefined>;
}
/** Something that can replace an image in a prompt with what it says. */
export interface PromptResolver {
    /** Whether reading is possible at all right now. */
    readonly available: boolean;
    resolve(content: readonly PromptPart[], route: ModelRoute | undefined): Promise<PromptPart[]>;
}
/** Construction options. */
export interface SessionRunnerOptions {
    readonly host: AgentHost;
    readonly bindings: BindingStore;
    /**
     * The directory a conversation's next session opens in.
     *
     * Per conversation rather than one value, because `/cd` is per chat — and
     * read late, so a change reaches the next session rather than the next
     * restart. A session's own cwd never moves: the sandbox derives its writable
     * root from it and the harness calls that root immutable, which is why
     * changing directory starts a fresh conversation.
     */
    readonly cwdFor: (target: ChatTarget) => string;
    /** Session id factory; injected so tests can assert on stable ids. */
    readonly newSessionId?: () => string;
    /**
     * Puts a session on the conversation's permission preset.
     *
     * Applied to a resumed session as well as a new one: the preset is a
     * property of the surface the conversation arrives over, and a session that
     * outlived a restart is still that conversation.
     */
    readonly permission?: {
        apply(target: ChatTarget, sessionId: string): void;
    };
    /**
     * Remembers which conversations this chat has had, so `/sessions` can offer
     * one back. Absent makes `/new` the one-way door it used to be.
     */
    readonly history?: {
        remember(target: ChatTarget, session: {
            sessionId: string;
            startedAt: number;
            cwd: string;
            label?: string;
        }): Promise<void>;
    };
    /**
     * Reads an image with a vision model so the conversation receives text.
     *
     * This is what keeps a conversation on its own model: a provider inspects
     * the whole request history, so an image that reaches the conversation binds
     * it to a model that can see for as long as it lives.
     */
    readonly extractor?: PromptResolver;
    /**
     * Whether the model this conversation runs on reads images itself.
     *
     * When it does, extraction is not merely unnecessary — it is worse. The
     * conversation would receive a transcription instead of the picture, so a
     * diagram, a chart or a misaligned layout becomes scattered words, and the
     * model never gets to look at the thing it was asked about.
     *
     * The indirection exists because a provider inspects the whole request
     * history: an image left in a conversation binds it to a model that can see.
     * When that model IS the one the conversation chose, there is nothing to be
     * stuck on and nothing to work around.
     */
    readonly modelSees?: (target: ChatTarget) => Promise<boolean>;
    /**
     * The model this conversation reads images with.
     *
     * Per conversation because `/vision` is, and read late so a change lands on
     * the next such turn. It is also what a conversation moves onto when the
     * picture could not be read and had to go through as it was.
     */
    readonly visionRoute?: (target: ChatTarget) => ModelRoute | undefined;
    /**
     * The model this conversation chose, if it chose one.
     *
     * Read per prompt rather than at session creation, because the harness reads
     * a mutable selection while assembling each step — which is what lets
     * `/model` take effect on the very next message rather than the next `/new`.
     */
    readonly chosenRoute?: (target: ChatTarget) => ModelRoute | undefined;
    readonly logger?: Logger;
}
export declare class SessionRunner implements AgentRunner {
    private readonly options;
    private readonly logger;
    private readonly newSessionId;
    /** Serialises work per conversation, so two fast messages cannot both create. */
    private readonly chains;
    constructor(options: SessionRunnerOptions);
    /**
     * Deliver a prompt, opening or resuming the conversation's session first.
     *
     * @param target - the conversation the prompt came from.
     * @param text - what the user typed.
     */
    prompt(target: ChatTarget, content: readonly PromptPart[]): Promise<void>;
    /**
     * Turn images into text, where there is anything able to do it.
     *
     * A failure here is not the turn's failure: the picture simply goes through
     * as it is, and the conversation moves to a model that can see it.
     */
    private resolve;
    /**
     * Which model this conversation's next step must run on.
     *
     * Not a per-turn choice, though it looks like one. A provider checks the
     * WHOLE request history for images, so once a session's log carries one,
     * every later turn — however plain its own text — fails on a model that
     * cannot see. The override therefore sticks to the conversation from the
     * first image until it is reset with `/new`.
     */
    private routeFor;
    /**
     * Point a conversation at a session it had before.
     *
     * The session is not loaded here: the next message resumes it through the
     * ordinary path, which is also the path that handles a log that can no
     * longer be read.
     *
     * @param target - the conversation.
     * @param sessionId - a session this chat had earlier.
     */
    adopt(target: ChatTarget, sessionId: string): Promise<void>;
    /**
     * Forget the conversation's session so the next prompt opens a new one.
     *
     * @param target - the conversation to reset.
     */
    reset(target: ChatTarget): Promise<void>;
    /**
     * Cancel whatever the conversation's agent is doing.
     *
     * @returns whether there was a loaded agent to cancel.
     */
    stop(target: ChatTarget): Promise<boolean>;
    /**
     * Describe the conversation as rows, for the caller to render.
     *
     * Rows rather than finished markup, because the caller adds its own — the
     * model, the effort, what the agent may do — and stitching those onto a
     * rendered string would mean parsing it back apart.
     */
    status(target: ChatTarget): Promise<StatusRow[]>;
    /**
     * The agent for a conversation: loaded, resumed, or freshly created.
     *
     * A binding whose session cannot be resumed is replaced rather than
     * reported: the user's next message should work.
     */
    private agentFor;
    /**
     * Run one conversation's work after its previous work.
     *
     * Two messages arriving in the same poll batch would otherwise both see no
     * binding and both create a session, orphaning the first.
     */
    private serialize;
}
//# sourceMappingURL=runner.d.ts.map