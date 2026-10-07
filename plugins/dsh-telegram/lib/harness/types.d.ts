/**
 * Structural mirrors of the DeepSeek Harness seams this plugin plugs into.
 *
 * These are declared rather than imported so the package builds and tests on
 * its own, without a harness checkout. They are structural types: the plugin
 * entry casts the live `ctx` services to them at the single boundary where the
 * harness is actually present, so a drift in the real contract shows up there
 * instead of spreading through every module.
 *
 * Sources mirrored:
 * - `@deepseek-ai/dsh-user-questions` — `ctx.userQuestions`
 * - `@deepseek-ai/dsh-user-approval`  — the `approval/request` waterfall
 * - `@deepseek-ai/dsh-agent`          — `ctx.agents`
 * - `@deepseek-ai/dsh-session`        — the `session/event` feed
 */
/** One selectable answer offered to the user. */
export interface AskUserQuestionOption {
    readonly label: string;
    readonly description?: string;
}
/**
 * A caller-declared presentation intent. `plan-review` means the question IS a
 * plan approval, and `detail` carries the plan itself.
 */
export interface AskUserQuestionIntent {
    readonly kind: 'plan-review';
    /** The option label that approves; every other option declines. */
    readonly approve: string;
}
/** One question in a user-questions request. */
export interface AskUserQuestionItem {
    readonly id: string;
    readonly question: string;
    readonly detail?: string;
    readonly header?: string;
    readonly options?: readonly AskUserQuestionOption[];
    readonly multiSelect?: boolean;
    readonly intent?: AskUserQuestionIntent;
}
/** Answer to one question. */
export interface AskUserQuestionAnswerItem {
    readonly id: string;
    readonly selected: string[];
    readonly custom?: string;
}
/** The human's answer to a whole request. */
export interface AskUserQuestionAnswer {
    readonly answers: AskUserQuestionAnswerItem[];
}
/** A live agent, as far as this plugin needs to know. */
export interface HarnessAgent {
    readonly id: string;
    readonly session: {
        readonly id: string;
    };
}
/** One `ctx.userQuestions.ask()` request. */
export interface UserQuestionRequest {
    readonly questions: readonly AskUserQuestionItem[];
    readonly agent?: HarnessAgent;
    readonly signal?: AbortSignal;
}
/** The single UI provider registered on `ctx.userQuestions`. */
export interface UserQuestionProvider {
    ask(request: UserQuestionRequest): Promise<AskUserQuestionAnswer>;
}
/** `ctx.userQuestions` — the seam we register against, and take over. */
export interface UserQuestionService {
    /** Explicitly clearable: taking the slot over requires emptying it first. */
    provider?: UserQuestionProvider | undefined;
    registerProvider(provider: UserQuestionProvider): () => void;
}
/** Every outcome the approval waterfall may produce; only one is a grant. */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/** One pending approval decision. */
export interface ApprovalRequest {
    readonly agent: HarnessAgent;
    readonly toolName: string;
    readonly callId?: string;
    readonly reason?: string;
    readonly signal?: AbortSignal;
}
/** The minimal logger surface the harness hands a plugin. */
export interface Logger {
    info(message: string, ...rest: unknown[]): void;
    warn(message: string, ...rest: unknown[]): void;
    error(message: string, ...rest: unknown[]): void;
    debug(message: string, ...rest: unknown[]): void;
}
/** A no-op logger, so every module can take a logger without a null check. */
export declare const SILENT_LOGGER: Logger;
/** One registered settings namespace, from the owner's side. */
export interface SettingsScope<T> {
    /** The resolved value: schema defaults, then composition base, then user document. */
    get(): T;
    /** Observe committed changes; returns a disposer. */
    watch(callback: (next: T, previous: T) => void): () => void;
    /** Merge a patch into the user layer. */
    update(patch: Partial<T>): Promise<void>;
}
/** `ctx.settings` — the seam a configuration UI reads and writes through. */
export interface SettingsService {
    register<T>(namespace: string, schema: unknown, options?: {
        base?: unknown;
        applies?: string;
    }): SettingsScope<T>;
}
//# sourceMappingURL=types.d.ts.map