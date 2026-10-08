/**
 * Cambiar de proyecto (Workspace del harness) desde Telegram.
 *
 * Un proyecto del harness es un Workspace: una carpeta de trabajo con nombre que
 * agrupa las conversaciones que corren ahí. `/cd` ya sabe cambiar de carpeta,
 * pero hay que escribir la ruta entera de memoria; y las rutas de un servidor no
 * son algo que alguien recuerde desde el teléfono.
 *
 * Así que se ofrecen como botones, igual que la lista de conversaciones de
 * `/sessions`: la lista ya está en pantalla, no hay nada que tipear ni que
 * equivocar. Elegir un proyecto hace exactamente lo mismo que `/cd` con esa
 * carpeta — la fija para el chat y abre una conversación nueva, porque el cwd de
 * una sesión se fija cuando la sesión abre y el sandbox deriva de ahí su raíz
 * escribible.
 *
 * La lista sale del registro de proyectos del harness (`workspaceRegistry`), y
 * si ese servicio no está montado se lee el archivo durable del registro. Nunca
 * es fatal: sin lista, se avisa y no se toca nada.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from '../render/escape.js';
import { SILENT_LOGGER } from '../harness/types.js';

/** Prefix marking callback data as belonging to the project picker. */
const KIND = 'p';
/** How many to offer; Telegram keyboards get unusable long before this. */
const OFFER = 8;

export class ProjectPicker {
    options;
    logger;
    /** One outstanding keyboard per chat or group topic. */
    active = new Map();

    constructor(options) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }

    /**
     * The harness projects, in the order the panel shows them.
     *
     * @returns labelled directories, or an empty list when none is readable.
     */
    projects() {
        const fromRegistry = this.fromRegistry();
        if (fromRegistry !== undefined)
            return fromRegistry;
        return this.fromStorage();
    }

    /** The live registry, when this deployment mounted it. */
    fromRegistry() {
        try {
            const registry = this.options.registry?.();
            if (registry === undefined || registry === null)
                return undefined;
            const rows = registry.list() ?? [];
            return rows
                .filter((row) => typeof row?.path === 'string')
                .map((row) => ({ path: row.path, title: typeof row.title === 'string' ? row.title : row.path }));
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not read the project registry', error);
            return undefined;
        }
    }

    /** Fallback: the registry's durable file, read-only. */
    fromStorage() {
        try {
            const file = join(this.options.home, 'storages', 'workspace.json');
            const data = JSON.parse(readFileSync(file, 'utf8'));
            const table = data?.tables?.workspaces ?? {};
            return (data?.global?.workspaceIds ?? [])
                .map((id) => table[id])
                .filter((row) => row !== undefined && typeof row.path === 'string')
                .map((row) => ({ path: row.path, title: typeof row.title === 'string' ? row.title : row.path }));
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not read the project store', error);
            return [];
        }
    }

    /**
     * Offer this chat's projects.
     *
     * @param target - the conversation asking.
     */
    async offer(target) {
        const key = targetKey(target);
        const previous = this.active.get(key);
        if (previous !== undefined)
            this.options.pending.cancel(previous);
        this.active.delete(key);

        const all = this.projects();
        if (all.length === 0) {
            await this.say(target, 'No encontré proyectos en el harness.\n\n' +
                'Creá uno desde el panel, o con <code>python3 ~/.dsh/skills/crear-proyecto-harness/scripts/proyecto.py crear &lt;carpeta&gt;</code>.');
            return;
        }
        const current = this.options.current(target);
        const list = all.slice(0, OFFER);
        const waiter = this.options.pending.open({});
        this.active.set(key, waiter.token);
        const keyboard = list.map((project, index) => [
            {
                text: `${project.path === current ? '✅ ' : ''}${project.title}`,
                callbackData: `${KIND}:${waiter.token}:${index}`,
            },
        ]);
        const delivered = await this.say(target, [
            '<b>Proyectos</b>',
            '',
            `Estás en <code>${escapeHtml(current ?? 'una carpeta sin registrar')}</code>.`,
            'Elegí uno para trabajar ahí.',
        ].join('\n'), keyboard);
        if (!delivered)
            this.options.pending.cancel(waiter.token);
        const pressed = await waiter.promise;
        if (this.active.get(key) === waiter.token)
            this.active.delete(key);
        if (typeof pressed !== 'string')
            return;
        const chosen = list[Number.parseInt(pressed, 10)];
        if (chosen === undefined)
            return;
        await this.switchTo(target, chosen, current);
    }

    /** Record the chosen directory and start the conversation that runs in it. */
    async switchTo(target, chosen, current) {
        if (chosen.path === current) {
            await this.say(target, `Ya estás en <b>${escapeHtml(chosen.title)}</b>.`);
            return;
        }
        const verdict = await this.options.inspect(chosen.path);
        if (verdict !== 'directory') {
            const why = verdict === 'file'
                ? 'eso es un archivo, no una carpeta'
                : verdict === 'denied'
                    ? 'no se puede leer'
                    : 'esa carpeta ya no existe';
            await this.say(target, `⚠️ No puedo usar <b>${escapeHtml(chosen.title)}</b> — ${why}.`);
            return;
        }
        try {
            await this.options.set(target, chosen.path);
        }
        catch (error) {
            this.logger.error('[dsh-telegram] could not record the chosen project', error);
            await this.say(target, '⚠️ No se pudo guardar el proyecto.');
            return;
        }
        // After the directory is recorded, so a failed reset still leaves the
        // choice in place for the next message rather than losing it silently.
        await this.options.reset(target);
        await this.say(target, `📁 Ahora trabajo en <b>${escapeHtml(chosen.title)}</b>\n` +
            `<code>${escapeHtml(chosen.path)}</code>\n\n` +
            '🆕 Empecé una conversación nueva — cada conversación conserva su carpeta.');
    }

    /**
     * Route one button press.
     *
     * @param data - raw `callback_data` from the update.
     * @returns whether the press belonged to an open picker.
     */
    handleCallback(data) {
        if (data === undefined)
            return false;
        const parts = data.split(':');
        if (parts.length !== 3 || parts[0] !== KIND)
            return false;
        const token = parts[1];
        const index = parts[2];
        if (token === '' || !/^\d+$/.test(index))
            return false;
        return this.options.pending.settle(token, index);
    }

    /** Post one message, swallowing delivery failures. */
    async say(target, html, keyboard) {
        try {
            await this.options.surface.send(target, html, keyboard);
            return true;
        }
        catch (error) {
            this.logger.warn('[dsh-telegram] could not offer the project list', error);
            return false;
        }
    }
}

/** Stable identity for a private chat, group, or one group topic. */
function targetKey(target) {
    return target.threadId === undefined ? target.chatId : `${target.chatId}#${target.threadId}`;
}
