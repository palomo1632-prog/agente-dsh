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
/**
 * Make an agent follow a mutable selection.
 *
 * @param agentCtx - the agent's scoped context, during unpublished setup.
 * @param selection - the object whose `current` decides each step's route.
 * @returns a disposer removing both listeners.
 */
export function installModelSelection(agentCtx, selection) {
    const disposeAssembly = agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
        const selected = selection.current;
        const assembled = await next();
        // Recorded even when absent: the request half reads this, and a stale
        // value would route one step on a selection another step assembled.
        selection.assembled = selected;
        if (selected === undefined)
            return assembled;
        return {
            ...assembled,
            variables: {
                ...assembled.variables,
                provider: selected.provider,
                model: selected.model,
            },
        };
    });
    const disposeRequest = agentCtx.on('agent/request', async (_payload, next) => {
        const resolved = await next();
        const selected = selection.assembled;
        if (selected === undefined)
            return resolved;
        // The inherited effort is dropped rather than kept: it belongs to the
        // model being replaced, and a effort one model offers another may not.
        const { reasoningEffort: _inherited, ...withoutInheritedEffort } = resolved;
        return {
            ...withoutInheritedEffort,
            provider: selected.provider,
            model: selected.model,
            ...(selected.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: selected.reasoningEffort }),
        };
    });
    return () => {
        disposeAssembly();
        disposeRequest();
    };
}
/** Whether two routes name the same model and reasoning effort. */
export function sameRoute(a, b) {
    if (a === undefined || b === undefined)
        return a === b;
    return (a.provider === b.provider &&
        a.model === b.model &&
        a.reasoningEffort === b.reasoningEffort);
}
/**
 * Parse a `provider/model` setting.
 *
 * A model id may itself contain slashes — `openai/gpt-5` on a router-style
 * provider is ordinary — so only the first separator divides them.
 *
 * @param value - the configured string; empty means no vision model.
 * @returns the route, or undefined when unset or malformed.
 */
export function parseRoute(value) {
    const trimmed = value?.trim();
    if (!trimmed)
        return undefined;
    const separator = trimmed.indexOf('/');
    if (separator <= 0 || separator === trimmed.length - 1)
        return undefined;
    return {
        provider: trimmed.slice(0, separator),
        model: trimmed.slice(separator + 1),
    };
}
//# sourceMappingURL=model-selection.js.map