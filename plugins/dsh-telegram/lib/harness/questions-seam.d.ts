/**
 * Taking over the single user-questions provider without stealing it.
 *
 * `ctx.userQuestions` accepts exactly one provider and throws
 * `DUPLICATE_PROVIDER` on a second registration. In a profile that also runs
 * the web app, the browser has already claimed that slot — so a naive
 * registration here would either fail to load or, worse, silently take every
 * question away from the browser.
 *
 * Instead this seam swaps itself in and keeps the displaced provider as a
 * fallback, so a question belonging to a browser session is forwarded straight
 * back to it. Both surfaces keep working, and whichever one the user is
 * actually looking at is the one that answers.
 *
 * On unload the previous provider is put back, so unloading this plugin
 * restores exactly the arrangement that existed before it loaded.
 */
import type { Logger, UserQuestionProvider, UserQuestionService } from './types.js';
/** What was installed, and how to undo it. */
export interface QuestionSeam {
    /** The provider that was registered before, if any. */
    readonly previous: UserQuestionProvider | undefined;
    /** Restore the previous arrangement. */
    restore(): void;
}
/**
 * Install a provider as the active one, chaining any incumbent.
 *
 * @param service - the live `ctx.userQuestions` service.
 * @param build - builds the provider, given the incumbent to delegate to.
 * @param logger - records which arrangement was chosen.
 */
export declare function installQuestionProvider(service: UserQuestionService, build: (previous: UserQuestionProvider | undefined) => UserQuestionProvider, logger?: Logger): QuestionSeam;
//# sourceMappingURL=questions-seam.d.ts.map