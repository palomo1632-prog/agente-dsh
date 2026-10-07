/**
 * Taking over the user-questions waterfall without stealing it.
 *
 * DSH 0.1.6 exposed `ctx.userQuestions` as a single-provider slot, and this seam
 * used to displace the incumbent through `registerProvider`. DSH 0.2.0 removed
 * that API: `UserQuestionService` now dispatches a Cordis waterfall on
 * `user-questions/request`, scoped to the asking agent, and every UI registers
 * its own listener. `registerProvider` no longer exists, so the old code threw
 * `TypeError: service.registerProvider is not a function` while installing —
 * silently leaving Telegram with no answerer at all, which made every
 * `ask_user_question` wait forever for a UI nobody was looking at.
 *
 * The waterfall is the same mechanism the approval path in this plugin already
 * uses, so the same arrangement applies here: register with `prepend` so the
 * chat is offered the request before the web UI's forwarder (which claims any
 * connected browser session), and delegate with `next()` when the asking session
 * is not bound to a Telegram chat. Both surfaces keep working, and whichever one
 * the user is actually looking at answers.
 *
 * Cordis admits an untagged listener to every scoped dispatch, and a listener
 * owned by an enclosing scope receives each descendant scope's events — which is
 * why a listener registered here sees agent-scoped requests.
 */
/**
 * Install the question handler on the waterfall.
 *
 * @param scope - the plugin's context, carrying `userQuestions`.
 * @param handle - decides per request: returns the answer, or delegates by
 *   calling the supplied `next`.
 * @param logger - records which arrangement was chosen.
 * @returns a disposable that removes the listener again.
 */
export function installQuestionProvider(scope, handle, logger) {
    const dispose = scope.on('user-questions/request', handle, { prepend: true });
    logger?.info('[dsh-telegram] answering the agent\'s questions in Telegram (0.2.0 waterfall), forwarding other sessions to the existing UI');
    return { restore: dispose };
}
//# sourceMappingURL=questions-seam.js.map
