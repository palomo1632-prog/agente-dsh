/**
 * Changing which model a live agent's next step runs on.
 *
 * The harness holds one mutable selection object per agent, installed while
 * the agent is still unpublished, and reads `current` each time it assembles a
 * prompt. Mutating that object is how the web UI's model picker changes a
 * running session's model, and it is what lets a conversation carrying an
 * image run somewhere its neighbours do not.
 *
 * `current: undefined` means "no override", so the agent falls back to the
 * route it was created with. That is what makes reverting free: there is
 * nothing to restore, only an override to drop.
 *
 * ## Why this is reproduced rather than imported
 *
 * The harness exports `installModelSelection` from `@deepseek-ai/dsh-agent`,
 * and importing it would be the obvious thing to do. It cannot be done: under
 * pnpm's isolated layout a plugin resolves only its own declared dependencies,
 * and the harness packages are the host's, not ours. A dynamic import of them
 * fails with `ERR_MODULE_NOT_FOUND` every time — which is exactly how this
 * feature came to do nothing at all while looking like it worked.
 *
 * What it does is two listener registrations on the agent's own context, so
 * that is what this does. The coupling is to two event names and their
 * payloads; `test/model-selection.test.ts` pins both.
 */
/** A provider and model an agent's next step should use. */
export interface ModelRoute {
    readonly provider: string;
    readonly model: string;
    /** Effort to request; absent clears any inherited one. */
    readonly reasoningEffort?: string;
}
/** The object read before each prompt assembly. */
export interface MutableSelection {
    /** The override in force, or undefined to use the agent's own route. */
    current?: ModelRoute | undefined;
    /**
     * The selection the last assembly actually used.
     *
     * Recorded at assembly and read at request time so both halves of one step
     * agree, even if `current` changes in between.
     */
    assembled?: ModelRoute | undefined;
}
/** The slice of an agent's scoped context this needs. */
export interface AgentContextLike {
    on(event: 'system-prompt/assemble', listener: (assembly: unknown, context: unknown, next: () => Promise<PromptAssembly>) => Promise<PromptAssembly>): () => void;
    on(event: 'agent/request', listener: (payload: unknown, next: () => Promise<ModelRequest>) => Promise<ModelRequest>): () => void;
}
/** What a prompt assembly carries that this rewrites. */
interface PromptAssembly {
    variables?: Record<string, unknown>;
}
/** What a model request carries that this rewrites. */
interface ModelRequest {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}
/**
 * Make an agent follow a mutable selection.
 *
 * @param agentCtx - the agent's scoped context, during unpublished setup.
 * @param selection - the object whose `current` decides each step's route.
 * @returns a disposer removing both listeners.
 */
export declare function installModelSelection(agentCtx: AgentContextLike, selection: MutableSelection): () => void;
/** Whether two routes name the same model and reasoning effort. */
export declare function sameRoute(a: ModelRoute | undefined, b: ModelRoute | undefined): boolean;
/**
 * Parse a `provider/model` setting.
 *
 * A model id may itself contain slashes — `openai/gpt-5` on a router-style
 * provider is ordinary — so only the first separator divides them.
 *
 * @param value - the configured string; empty means no vision model.
 * @returns the route, or undefined when unset or malformed.
 */
export declare function parseRoute(value: string | undefined): ModelRoute | undefined;
export {};
//# sourceMappingURL=model-selection.d.ts.map