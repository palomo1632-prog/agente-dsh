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
import type { Logger } from './types.js';
import type { AgentHost } from '../session/runner.js';
import type { MessageFactory } from './message.js';
import type { AgentContextLike, MutableSelection } from './model-selection.js';
/** A bare agent from the registry. */
interface HarnessAgentLike {
    readonly id: string;
    followup(message: unknown): void;
    cancel(cause: string, options?: {
        keepInbox?: boolean;
    }): void;
}
/** An owned agent plus its disposer. */
interface HarnessAgentHandle {
    readonly agent: HarnessAgentLike;
    dispose(): Promise<void>;
}
/** The model route an agent opens its requests on. */
export interface ModelRoute {
    readonly provider: string;
    readonly model: string;
}
/**
 * The preset roster, narrowed to what one agent's composition needs.
 *
 * A preset is where the tools live. The registries themselves are host-plane,
 * but almost every model-facing row — bash, the editor, grep, skills,
 * subagents, todo, plan mode — is registered into the PRESET's scope layer, so
 * an agent that joins no preset reaches the model with only whatever the host
 * composition registered globally. In this deployment that is the web tools
 * and nothing else.
 */
export interface AgentPresetsLike {
    resolve(id?: string): Promise<{
        id: string;
    }>;
    mount(agentCtx: unknown, id?: string): Promise<unknown>;
}
/** The `ctx.agents` surface this plugin uses. */
export interface AgentRegistryLike {
    get(sessionId: string): HarnessAgentLike | undefined;
    create(options: {
        sessionId: string;
        meta?: {
            cwd?: string;
            agentPreset?: string;
        };
        agentOptions?: ModelRoute;
        setup?: (agentCtx: unknown) => void | Promise<void>;
    }): Promise<HarnessAgentHandle>;
    resume(options: {
        resumeSessionId: string;
        agentOptions?: ModelRoute;
        setup?: (agentCtx: unknown) => void | Promise<void>;
    }): Promise<HarnessAgentHandle>;
}
/** Construction options. */
export interface HarnessAgentHostOptions {
    readonly agents: AgentRegistryLike;
    readonly message: MessageFactory;
    /**
     * The deployment's model route, read at creation time rather than captured,
     * so a default changed in Settings reaches the next conversation.
     *
     * An agent created without one has no route to name, and prompt assembly
     * fails the turn on an empty `{{model}}` variable — a failure that surfaces
     * as a broken reply rather than as anything about models.
     */
    readonly selectModel?: () => ModelRoute | undefined;
    /**
     * Installs the mutable model selection into a new agent's scope. Absent
     * leaves every turn on the session's own route.
     */
    readonly installSelection?: (agentCtx: AgentContextLike, selection: MutableSelection) => void;
    /**
     * The preset roster, where the deployment composes one. Absent is a real
     * deployment shape — the harness's own agent factory handles it too — and
     * means the agent gets whatever the host composition registered globally.
     */
    readonly presets?: AgentPresetsLike;
    /** Preset to compose Telegram agents from; absent takes the roster default. */
    readonly presetId?: () => string | undefined;
    readonly logger?: Logger;
}
/**
 * Build an {@link AgentHost} over the live harness registry.
 *
 * @param options - the registry, the message factory, and a logger.
 */
export declare function createAgentHost(options: HarnessAgentHostOptions): AgentHost;
export {};
//# sourceMappingURL=host.d.ts.map