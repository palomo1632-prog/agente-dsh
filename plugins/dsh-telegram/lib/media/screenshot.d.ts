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
import type { Logger } from '../harness/types.js';
/** Telegram refuses a photo above this; a document goes up to 50 MB. */
export declare const PHOTO_LIMIT_BYTES: number;
/** What a capture produced. */
export type Capture = {
    readonly kind: 'image';
    readonly data: Uint8Array;
    readonly filename: string;
} | {
    readonly kind: 'unsupported';
    readonly platform: string;
} | {
    readonly kind: 'failed';
    readonly reason: string;
};
/** Running the capture tool; injected so tests need no screen. */
export type CaptureRunner = (output: string, signal: AbortSignal) => Promise<void>;
/** Construction options. */
export interface ScreenshotOptions {
    readonly platform?: string;
    readonly run?: CaptureRunner;
    readonly timeoutMs?: number;
    readonly logger?: Logger;
}
export declare class Screenshotter {
    private readonly options;
    private readonly logger;
    constructor(options?: ScreenshotOptions);
    /** Whether this platform has a capture tool this knows how to drive. */
    get available(): boolean;
    /**
     * Capture the screen.
     *
     * @returns the image, or why there is none.
     */
    take(): Promise<Capture>;
}
//# sourceMappingURL=screenshot.d.ts.map