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
/** A no-op logger, so every module can take a logger without a null check. */
export const SILENT_LOGGER = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
};
//# sourceMappingURL=types.js.map