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
import { Config } from './config.js';
import type { AgentRegistryLike } from './harness/host.js';
import type { Logger } from './harness/types.js';
import type { TelegramConfig } from './config.js';
export { Config };
export type { TelegramConfig };
/** Cordis plugin name; the package name, which is also the module id. */
export declare const name = "@sympoies/dsh-telegram";
/**
 * Settings namespace this plugin owns. The browser half binds the same string,
 * which is the only thing pairing the two halves together.
 */
export declare const SETTINGS_NAMESPACE = "telegram";
/**
 * Hard requirements only. Cordis reads this as a flat list of service names —
 * an object form would be read as services literally named after its keys — so
 * the interactive seams are bound inside `apply` with `ctx.inject()` instead.
 * That is what lets the plugin load on a profile that provides neither.
 */
export declare const inject: string[];
/** The slice of the cordis context this plugin uses. */
interface PluginContext {
    agents: AgentRegistryLike;
    credentials: {
        resolve(ref: unknown): Promise<{
            value?: string;
        } | undefined>;
    };
    logger(name: string): Logger;
    get(key: string): unknown;
    on(name: string, listener: (...args: never[]) => unknown, prepend?: boolean): () => void;
    effect(callback: () => (() => void) | Promise<() => void>, label?: string): () => void;
    /** Run `callback` once every named service is available; never, if one is not. */
    inject(names: readonly string[], callback: (scope: PluginContext) => void): Disposable;
}
/** What `ctx.inject` hands back: a fiber whose disposal unwinds the callback. */
interface Disposable {
    dispose(): unknown;
}
/**
 * Load the plugin.
 *
 * @param ctx - the cordis context.
 * @param config - resolved plugin configuration.
 */
export declare function apply(ctx: PluginContext, config: TelegramConfig): void;
//# sourceMappingURL=index.d.ts.map