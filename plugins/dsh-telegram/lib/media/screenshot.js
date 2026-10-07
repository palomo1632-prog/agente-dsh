/**
 * Taking a picture of the screen the harness is running on.
 *
 * Useful for the same reason the bot exists at all: the machine is at a desk
 * and you are not. Checking what a long build is showing, or what that dialog
 * says, is otherwise a trip back to the keyboard.
 *
 * It is also the one thing this plugin does that sends the machine's own
 * contents outward without the agent being involved, and a screen holds
 * whatever happens to be on it — an open password manager, someone else's
 * messages, an unrelated customer's data. So it is off unless switched on, and
 * the switch is deliberately a deployment setting rather than a chat command:
 * turning it on should take the same access as configuring the bot.
 *
 * macOS also requires Screen Recording permission for the process that runs
 * the harness. Without it `screencapture` succeeds and returns the desktop
 * picture with no windows, which looks like a broken feature rather than a
 * missing permission — so that case is named rather than shrugged at.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SILENT_LOGGER } from '../harness/types.js';
/** How long to wait for the capture before giving up. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** Telegram refuses a photo above this; a document goes up to 50 MB. */
export const PHOTO_LIMIT_BYTES = 10 * 1024 * 1024;
export class Screenshotter {
    options;
    logger;
    constructor(options = {}) {
        this.options = options;
        this.logger = options.logger ?? SILENT_LOGGER;
    }
    /** Whether this platform has a capture tool this knows how to drive. */
    get available() {
        return (this.options.platform ?? process.platform) === 'darwin' || this.options.run !== undefined;
    }
    /**
     * Capture the screen.
     *
     * @returns the image, or why there is none.
     */
    async take() {
        const platform = this.options.platform ?? process.platform;
        if (!this.available)
            return { kind: 'unsupported', platform };
        // Written to a directory of its own so the file cannot collide with
        // another capture, and so one removal cleans up whatever was produced.
        const directory = await mkdtemp(join(tmpdir(), 'dsh-telegram-shot-'));
        const output = join(directory, 'screen.png');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        try {
            await (this.options.run ?? captureWithScreencapture)(output, controller.signal);
            const data = await readFile(output);
            if (data.length === 0)
                return { kind: 'failed', reason: 'the capture came back empty' };
            return { kind: 'image', data, filename: 'screen.png' };
        }
        catch (error) {
            return { kind: 'failed', reason: describe(error, controller.signal.aborted) };
        }
        finally {
            clearTimeout(timer);
            await rm(directory, { recursive: true, force: true }).catch((error) => {
                this.logger.warn('[dsh-telegram] could not remove a screenshot', error);
            });
        }
    }
}
/** Drive macOS's own `screencapture`. */
function captureWithScreencapture(output, signal) {
    return new Promise((resolve, reject) => {
        // -x is silent: a bot taking a picture should not play the camera sound at
        // whoever is sitting there. -C includes the cursor, which is often the
        // point when someone asks what is on screen.
        execFile('/usr/sbin/screencapture', ['-x', '-C', output], { signal }, (error) => {
            if (error)
                reject(error);
            else
                resolve();
        });
    });
}
/** Turn whatever went wrong into something a person can act on. */
function describe(error, timedOut) {
    if (timedOut)
        return 'the capture took too long';
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT/.test(message))
        return 'no screen capture tool was found';
    // The permission case does not fail loudly on macOS — it quietly returns the
    // desktop picture — so this covers the version that does.
    if (/not permitted|denied/i.test(message)) {
        return 'the harness has no Screen Recording permission';
    }
    return message;
}
//# sourceMappingURL=screenshot.js.map