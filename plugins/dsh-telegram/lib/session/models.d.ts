/**
 * Choosing which model a Telegram conversation talks to.
 *
 * The web UI has a model picker; a phone had nothing, so every conversation
 * ran on whatever the deployment happened to default to. That is the wrong
 * place to be stuck: the reason to reach for a bot from a phone is often that
 * the question is small and a cheaper model would do, or that it is hard and a
 * better one is worth the wait.
 *
 * The choice is per conversation and durable, so it survives `/new` and a
 * restart. It is applied per turn rather than at session creation, because the
 * harness reads a mutable selection while assembling each step — which is what
 * lets a model change take effect on the very next message.
 */
import type { ModelRoute } from '../harness/model-selection.js';
/** One reasoning effort a model offers. */
export interface EffortOption {
    readonly id: string;
    readonly name?: string;
}
/** What a model says about its own reasoning. */
export interface ReasoningInfo {
    readonly efforts: readonly EffortOption[];
    readonly defaultEffort?: string;
}
/** One model a provider advertises. */
export interface CatalogModel {
    readonly id: string;
    readonly name?: string;
}
/** One configured provider and what it offers. */
export interface CatalogProvider {
    readonly id: string;
    readonly name?: string;
    readonly models: readonly CatalogModel[];
}
/** The `ctx.llm` surface this needs. */
export interface ProviderCatalog {
    listProviders(): readonly {
        id: string;
        name?: string;
    }[];
    listModels(provider: string): Promise<readonly CatalogModel[]>;
    resolveModelInfo(provider: string, model: string): Promise<{
        reasoning?: ReasoningInfo;
    }>;
}
/**
 * The efforts a route offers, and which one it uses by default.
 *
 * Read from the model rather than fixed here: `low`/`medium`/`high` is one
 * provider's vocabulary, not everyone's, and offering an effort a model does
 * not have would fail the turn rather than the command.
 *
 * @param catalog - the harness llm service.
 * @param route - the model to ask about.
 * @returns its reasoning options, or undefined when it has none or cannot say.
 */
export declare function effortsFor(catalog: ProviderCatalog, route: ModelRoute | undefined): Promise<ReasoningInfo | undefined>;
/**
 * Find the effort a user's words name.
 *
 * @param input - what followed `/effort`.
 * @param efforts - what the current model offers.
 * @returns the exact effort id, or undefined when nothing matches.
 */
export declare function matchEffort(input: string, efforts: readonly EffortOption[]): string | undefined;
/**
 * Every configured provider with its models, for a message that lists them.
 *
 * A provider whose catalog cannot be read is skipped rather than failing the
 * listing: one misconfigured key should not hide every other model.
 *
 * @param catalog - the harness llm service.
 */
export declare function listCatalog(catalog: ProviderCatalog): Promise<CatalogProvider[]>;
/**
 * Find the route a user's words name.
 *
 * Accepts the full `provider/model`, and a bare model id when exactly one
 * provider offers it — which is what anyone types first, and is unambiguous
 * often enough to be worth supporting. A bare id offered by several providers
 * is reported as ambiguous rather than guessed at.
 *
 * @param input - what followed `/model`.
 * @param providers - the configured catalog.
 */
export declare function matchRoute(input: string, providers: readonly CatalogProvider[]): {
    readonly kind: 'route';
    readonly route: ModelRoute;
} | {
    readonly kind: 'ambiguous';
    readonly candidates: readonly string[];
} | {
    readonly kind: 'unknown';
};
/** Render a route the way it is typed back in. */
export declare function formatRoute(route: ModelRoute | undefined): string;
//# sourceMappingURL=models.d.ts.map