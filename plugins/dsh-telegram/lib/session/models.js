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
import { parseRoute } from '../harness/model-selection.js';
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
export async function effortsFor(catalog, route) {
    if (!route)
        return undefined;
    try {
        const info = await catalog.resolveModelInfo(route.provider, route.model);
        return info.reasoning !== undefined && info.reasoning.efforts.length > 0
            ? info.reasoning
            : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Find the effort a user's words name.
 *
 * @param input - what followed `/effort`.
 * @param efforts - what the current model offers.
 * @returns the exact effort id, or undefined when nothing matches.
 */
export function matchEffort(input, efforts) {
    const wanted = input.trim().toLowerCase();
    if (wanted === '')
        return undefined;
    const exact = efforts.find((effort) => effort.id.toLowerCase() === wanted);
    if (exact)
        return exact.id;
    // A display name is what a person reads off the list, so it is what they
    // type back. Accepted only while it names one effort.
    const named = efforts.filter((effort) => (effort.name ?? '').toLowerCase() === wanted);
    return named.length === 1 ? named[0].id : undefined;
}
/**
 * Every configured provider with its models, for a message that lists them.
 *
 * A provider whose catalog cannot be read is skipped rather than failing the
 * listing: one misconfigured key should not hide every other model.
 *
 * @param catalog - the harness llm service.
 */
export async function listCatalog(catalog) {
    const providers = catalog.listProviders();
    const groups = await Promise.all(providers.map(async (provider) => {
        try {
            const models = await catalog.listModels(provider.id);
            return { id: provider.id, ...(provider.name ? { name: provider.name } : {}), models };
        }
        catch {
            return undefined;
        }
    }));
    return groups.filter((group) => group !== undefined && group.models.length > 0);
}
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
export function matchRoute(input, providers) {
    const wanted = input.trim();
    if (wanted === '')
        return { kind: 'unknown' };
    const qualified = parseRoute(wanted);
    if (qualified) {
        const provider = providers.find((entry) => entry.id === qualified.provider);
        const known = provider?.models.some((model) => model.id === qualified.model);
        // An unlisted route is still taken when its provider is configured: a
        // catalog can lag behind a model the provider actually serves, and
        // refusing would make this stricter than the web UI's own picker.
        if (provider)
            return { kind: 'route', route: qualified };
        if (known)
            return { kind: 'route', route: qualified };
    }
    const matches = providers.flatMap((provider) => provider.models
        .filter((model) => model.id.toLowerCase() === wanted.toLowerCase())
        .map((model) => `${provider.id}/${model.id}`));
    if (matches.length === 1) {
        const route = parseRoute(matches[0]);
        if (route)
            return { kind: 'route', route };
    }
    if (matches.length > 1)
        return { kind: 'ambiguous', candidates: matches };
    return { kind: 'unknown' };
}
/** Render a route the way it is typed back in. */
export function formatRoute(route) {
    return route === undefined ? 'el valor por defecto' : `${route.provider}/${route.model}`;
}
//# sourceMappingURL=models.js.map