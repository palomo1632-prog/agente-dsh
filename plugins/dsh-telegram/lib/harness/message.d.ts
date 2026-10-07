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
/** One block of model-visible content. */
export type ContentBlock = {
    readonly type: 'text';
    readonly text: string;
} | {
    readonly type: 'image';
    readonly attachment: unknown;
};
/** The message shape `agent.followup()` accepts. */
export interface UserMessageLike {
    readonly id: string;
    readonly role: 'user';
    readonly content: readonly ContentBlock[];
    readonly source: {
        readonly kind: 'user';
    };
}
/**
 * Builds one user message from content blocks.
 *
 * Blocks rather than a string because a prompt may carry an image: the model
 * sees `{ type: 'image', attachment }` beside the text, which is how a
 * screenshot becomes something it can actually look at.
 */
export type MessageFactory = (content: readonly ContentBlock[]) => UserMessageLike;
/** Build one user message in the shape the agent's inbox accepts. */
export declare function buildUserMessage(content: readonly ContentBlock[]): UserMessageLike;
//# sourceMappingURL=message.d.ts.map