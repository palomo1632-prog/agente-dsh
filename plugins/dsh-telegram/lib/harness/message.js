/**
 * Building the user message the agent's inbox accepts.
 *
 * `agent.followup()` takes an identified, frozen `UserMessage`. The harness
 * has its own factory for that — `createUserMessage` in `@deepseek-ai/dsh-llm`
 * — and this once tried to import it, preferring the real thing.
 *
 * It never once succeeded. Under pnpm's isolated layout a plugin resolves only
 * its own declared dependencies, and the harness packages belong to the host,
 * so the import failed with `ERR_MODULE_NOT_FOUND` on every call and this
 * shape was always what got used. Claiming otherwise in a comment made the
 * code harder to reason about, not easier.
 *
 * So the documented shape is the only path, and it is exact: an id, the user
 * role, the content blocks, and a `user` source, deep-frozen before it is
 * handed over.
 */
import { randomUUID } from 'node:crypto';
/** Build one user message in the shape the agent's inbox accepts. */
export function buildUserMessage(content) {
    return Object.freeze({
        id: randomUUID(),
        role: 'user',
        content: Object.freeze(content.map((block) => Object.freeze({ ...block }))),
        source: Object.freeze({ kind: 'user' }),
    });
}
//# sourceMappingURL=message.js.map