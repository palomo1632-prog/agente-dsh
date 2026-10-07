/**
 * Driving harness agents.
 *
 * This is the one module that reaches into `ctx.agents`, so the rest of the
 * plugin can be tested without a harness. It translates between the harness's
 * ownership model and the flat {@link RunningAgent} the session runner wants.
 *
 * The distinction that matters is who may tear an agent down. `ctx.agents.get`
 * returns a bare agent that anyone can observe but nobody can dispose;
 * `create`/`resume` return a handle whose disposer is a capability. So handles
 * are kept for the agents this plugin created, and a bare agent found in the
 * registry is borrowed and left alone — disposing something another owner
 * created would pull the session out from under them.
 */
import { sameRoute } from './model-selection.js';
/**
 * Build an {@link AgentHost} over the live harness registry.
 *
 * @param options - the registry, the message factory, and a logger.
 */
export function createAgentHost(options) {
    /** Agents this plugin owns, so it can dispose and re-route exactly those. */
    const owned = new Map();
    const wrap = (agent, sessionId) => ({
        sessionId,
        followup(content) {
            agent.followup(options.message(content));
        },
        useModel(route) {
            const entry = owned.get(sessionId);
            // A borrowed agent carries no selection of ours; its route is its own.
            if (!entry)
                return false;
            if (sameRoute(entry.selection.current, route))
                return true;
            entry.selection.current = route;
            return true;
        },
        cancel(reason) {
            agent.cancel(reason);
        },
        async dispose() {
            const entry = owned.get(sessionId);
            owned.delete(sessionId);
            // Only an owner may dispose. A borrowed agent is simply released.
            if (entry)
                await entry.handle.dispose();
        },
    });
    const adopt = (handle, sessionId, selection) => {
        owned.set(sessionId, { handle, selection });
        return wrap(handle.agent, sessionId);
    };
    /**
     * Everything one new agent needs composed into it.
     *
     * The preset is resolved here, before the agent exists, so a bad id fails
     * the creation rather than half-composing a session. The mount itself must
     * happen inside `setup`, which is the one place the agent is still
     * unpublished and a rejected composition can roll the whole thing back.
     */
    const prepareAgent = async () => {
        const selection = { current: undefined };
        const install = options.installSelection;
        let preset;
        if (options.presets) {
            try {
                preset = (await options.presets.resolve(options.presetId?.())).id;
            }
            catch (error) {
                // A named preset that has gone is not worth failing a message over;
                // the roster's own default still composes a usable agent.
                options.logger?.warn('[dsh-telegram] could not resolve the agent preset', error);
                preset = (await options.presets.resolve().catch(() => undefined))?.id;
            }
        }
        // The braces matter. The harness calls `.commit()` on whatever setup
        // returns, so handing back the installer's disposer — as an
        // expression-bodied arrow would — crashes agent creation on a function
        // that has no such method. An async body resolving to undefined is fine.
        //
        // Dropping the disposer is right anyway: the listeners live on the
        // agent's own scope and unwind when the agent does.
        const setup = async (agentCtx) => {
            if (install)
                install(agentCtx, selection);
            if (options.presets)
                await options.presets.mount(agentCtx, preset);
        };
        return {
            selection,
            ...(install || options.presets ? { setup } : {}),
            ...(preset === undefined ? {} : { preset }),
        };
    };
    return {
        live(sessionId) {
            const owner = owned.get(sessionId);
            if (owner)
                return wrap(owner.handle.agent, sessionId);
            const bare = options.agents.get(sessionId);
            return bare ? wrap(bare, sessionId) : undefined;
        },
        async create(sessionId, cwd, forced) {
            // A forced route comes from a caller that knows which model it needs —
            // reading an image — and outranks the deployment's default.
            const route = forced ?? options.selectModel?.();
            const prepared = await prepareAgent();
            const handle = await options.agents.create({
                sessionId,
                // Recorded so a later reader — a cold transcript, the web UI's session
                // list — resolves the same composition this agent runs on.
                meta: { cwd, ...(prepared.preset === undefined ? {} : { agentPreset: prepared.preset }) },
                ...(route ? { agentOptions: route } : {}),
                ...(prepared.setup ? { setup: prepared.setup } : {}),
            });
            return adopt(handle, sessionId, prepared.selection);
        },
        async resume(sessionId) {
            try {
                // Supplied on resume too, matching the harness's own entry points: a
                // log that already names a selection keeps it, and one that does not
                // — such as a session created before this route existed — is repaired.
                const route = options.selectModel?.();
                const prepared = await prepareAgent();
                const handle = await options.agents.resume({
                    resumeSessionId: sessionId,
                    ...(route ? { agentOptions: route } : {}),
                    ...(prepared.setup ? { setup: prepared.setup } : {}),
                });
                return adopt(handle, sessionId, prepared.selection);
            }
            catch (error) {
                // A pruned, moved, or incompatible log is an ordinary outcome here; the
                // runner starts a fresh conversation rather than failing the message.
                options.logger?.debug(`[dsh-telegram] resume of '${sessionId}' failed`, error);
                return undefined;
            }
        },
    };
}
//# sourceMappingURL=host.js.map