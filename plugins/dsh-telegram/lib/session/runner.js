/**
 * One harness session per Telegram conversation.
 *
 * The lifecycle has three states and the transitions between them are the
 * whole job: a conversation with no session yet, one whose session is loaded
 * in this process, and one whose session exists only in the durable log
 * because the harness has restarted since.
 *
 * The third case is why `resume` exists and why a failed resume is not fatal.
 * A session log can be pruned, moved, or written by an incompatible version;
 * when it can no longer be loaded, the user gets a fresh conversation and a
 * note, which is far better than a bot that answers every message with the
 * same load error.
 *
 * The agent host is injected rather than reached for directly, so this logic
 * is exercised without a running harness.
 */
import { randomUUID } from 'node:crypto';
import { SILENT_LOGGER } from '../harness/types.js';
import { escapeHtml } from '../render/escape.js';
/** The first words of a prompt, for labelling the conversation in a list. */
function firstText(content) {
    const said = content.find((part) => part.type === 'text');
    return said?.type === 'text' && said.text.trim() !== '' ? said.text : undefined;
}
/** Whether a prompt carries an image, which changes a conversation for good. */
function carriesImage(content) {
    return content.some((part) => part.type === 'image');
}
export class SessionRunner {
    options;
    logger;
    newSessionId;
    /** Serialises work per conversation, so two fast messages cannot both create. */
    chains = new Map();
    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
        this.newSessionId = options.newSessionId ?? (() => `tg-${randomUUID()}`);
    }
    /**
     * Deliver a prompt, opening or resuming the conversation's session first.
     *
     * @param target - the conversation the prompt came from.
     * @param text - what the user typed.
     */
    async prompt(target, content) {
        if (content.length === 0)
            return;
        // Asked once and used three times: whether to read the picture elsewhere,
        // whether to refuse it, and whether to move the conversation off its own
        // model. A model that can look wants none of that done for it.
        const sees = (await this.options.modelSees?.(target).catch(() => false)) === true;
        // Resolved before the conversation's agent is touched at all, and outside
        // the serialisation: reading an image takes a model call, and holding the
        // conversation's queue for it would stall every later message behind it.
        const resolved = sees ? [...content] : await this.resolve(target, content);
        if (resolved.length === 0)
            return;
        await this.serialize(target, async () => {
            const agent = await this.agentFor(target);
            // Only reached when an image survived resolution. Set before the prompt:
            // the harness reads the selection while assembling each step, so the
            // override must be in place by the time the turn runs.
            agent.useModel(this.routeFor(target, resolved, sees));
            // Recorded BEFORE the turn runs, because from this point the session's
            // log carries an image and every later turn must be routed for it.
            if (carriesImage(resolved))
                await this.options.bindings.markImages(target);
            // Recorded with the prompt rather than at creation, because the opening
            // words are what make the conversation recognisable in a list.
            await this.options.history
                ?.remember(target, {
                sessionId: agent.sessionId,
                startedAt: Date.now(),
                cwd: this.options.cwdFor(target),
                ...(firstText(resolved) === undefined ? {} : { label: firstText(resolved) }),
            })
                .catch(() => undefined);
            agent.followup(resolved);
        });
    }
    /**
     * Turn images into text, where there is anything able to do it.
     *
     * A failure here is not the turn's failure: the picture simply goes through
     * as it is, and the conversation moves to a model that can see it.
     */
    async resolve(target, content) {
        const extractor = this.options.extractor;
        if (!extractor?.available || !carriesImage(content))
            return [...content];
        try {
            return await extractor.resolve(content, this.options.visionRoute?.(target));
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not read an image; sending it as it is', error);
            return [...content];
        }
    }
    /**
     * Which model this conversation's next step must run on.
     *
     * Not a per-turn choice, though it looks like one. A provider checks the
     * WHOLE request history for images, so once a session's log carries one,
     * every later turn — however plain its own text — fails on a model that
     * cannot see. The override therefore sticks to the conversation from the
     * first image until it is reset with `/new`.
     */
    routeFor(target, content, sees) {
        // The conversation's own choice always applies. Dropping it here is what
        // made a model chosen with `/model` fall back to the deployment default —
        // and since that choice is the whole reason the model could see, the check
        // for "it can see" was undoing the thing it had just observed.
        const chosen = this.options.chosenRoute?.(target);
        if (sees)
            return chosen;
        const carried = this.options.bindings.forChat(target)?.hasImages === true;
        // An image outranks the conversation's own choice: a model that cannot see
        // fails the whole request, so this is not a preference to honour.
        if (carriesImage(content) || carried)
            return this.options.visionRoute?.(target) ?? chosen;
        return chosen;
    }
    /**
     * Point a conversation at a session it had before.
     *
     * The session is not loaded here: the next message resumes it through the
     * ordinary path, which is also the path that handles a log that can no
     * longer be read.
     *
     * @param target - the conversation.
     * @param sessionId - a session this chat had earlier.
     */
    async adopt(target, sessionId) {
        await this.serialize(target, async () => {
            const binding = this.options.bindings.forChat(target);
            if (binding?.sessionId === sessionId)
                return;
            // Released rather than disposed: the conversation being left is one the
            // user may well come back to, and disposing would end it.
            await this.options.bindings.bind(target, sessionId);
        });
    }
    /**
     * Forget the conversation's session so the next prompt opens a new one.
     *
     * @param target - the conversation to reset.
     */
    async reset(target) {
        await this.serialize(target, async () => {
            const binding = this.options.bindings.forChat(target);
            if (!binding)
                return;
            const live = this.options.host.live(binding.sessionId);
            if (live)
                await live.dispose().catch((error) => {
                    this.logger.warn('[dsh-telegram] could not dispose the previous agent', error);
                });
            await this.options.bindings.unbind(target);
        });
    }
    /**
     * Cancel whatever the conversation's agent is doing.
     *
     * @returns whether there was a loaded agent to cancel.
     */
    async stop(target) {
        const binding = this.options.bindings.forChat(target);
        if (!binding)
            return false;
        const live = this.options.host.live(binding.sessionId);
        if (!live)
            return false;
        live.cancel('stopped from Telegram');
        return true;
    }
    /**
     * Describe the conversation as rows, for the caller to render.
     *
     * Rows rather than finished markup, because the caller adds its own — the
     * model, the effort, what the agent may do — and stitching those onto a
     * rendered string would mean parsing it back apart.
     */
    async status(target) {
        const directory = this.options.cwdFor(target);
        const binding = this.options.bindings.forChat(target);
        // Worth naming the directory even with no conversation: it is what the
        // next message opens in, and `/cd` before the first message is reasonable.
        if (!binding) {
            return [
                { label: 'Sesión', value: 'ninguna todavía — mandá un mensaje para empezar' },
                { label: 'Carpeta', value: directory },
            ];
        }
        const live = this.options.host.live(binding.sessionId) !== undefined;
        return [
            { label: 'Sesión', value: binding.sessionId },
            { label: 'Carpeta', value: directory },
            { label: 'Estado', value: live ? 'activa' : 'en reposo, sigue con tu próximo mensaje' },
            {
                label: 'Desde',
                value: new Date(binding.createdAt).toISOString().replace('T', ' ').slice(0, 16),
            },
        ];
    }
    /**
     * The agent for a conversation: loaded, resumed, or freshly created.
     *
     * A binding whose session cannot be resumed is replaced rather than
     * reported: the user's next message should work.
     */
    async agentFor(target) {
        const binding = this.options.bindings.forChat(target);
        if (binding) {
            const live = this.options.host.live(binding.sessionId);
            if (live)
                return live;
            const resumed = await this.options.host.resume(binding.sessionId).catch((error) => {
                this.logger.warn(`[dsh-telegram] could not resume '${binding.sessionId}'`, error);
                return undefined;
            });
            if (resumed) {
                this.options.permission?.apply(target, resumed.sessionId);
                return resumed;
            }
            this.logger.warn(`[dsh-telegram] session '${binding.sessionId}' is gone; starting a fresh conversation`);
            await this.options.bindings.unbind(target);
        }
        const sessionId = this.newSessionId();
        const cwd = this.options.cwdFor(target);
        const agent = await this.options.host.create(sessionId, cwd);
        // After creation, because the harness pins an initial permission before
        // publishing the session; switching afterwards is the supported path.
        this.options.permission?.apply(target, sessionId);
        await this.options.bindings.bind(target, sessionId);
        await this.options.history
            ?.remember(target, { sessionId, startedAt: Date.now(), cwd })
            .catch((error) => {
            // Losing the entry costs a way back to this conversation, not the
            // conversation itself.
            this.logger.warn('[dsh-telegram] could not record the conversation', error);
        });
        return agent;
    }
    /**
     * Run one conversation's work after its previous work.
     *
     * Two messages arriving in the same poll batch would otherwise both see no
     * binding and both create a session, orphaning the first.
     */
    serialize(target, task) {
        const key = target.threadId === undefined ? target.chatId : `${target.chatId}#${target.threadId}`;
        const previous = this.chains.get(key) ?? Promise.resolve();
        const next = previous.then(task, task);
        this.chains.set(key, next.then(() => undefined, () => undefined));
        return next;
    }
}
//# sourceMappingURL=runner.js.map