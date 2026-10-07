/** Telegram voice notes become text before entering a DSH conversation. */
import type { MediaSource } from './collect.js';
/** Credentials and recordings may use cleartext only on the local host. */
export declare function isSafeSpeechEndpoint(value: string): boolean;
export interface VoiceNote {
    readonly file_id: string;
    readonly file_size?: number;
    readonly duration?: number;
}
export type VoiceResult = {
    readonly kind: 'success';
    readonly text: string;
} | {
    readonly kind: 'failure';
    readonly notice: string;
};
export interface VoiceTranscriber {
    transcribe(voice: VoiceNote): Promise<VoiceResult>;
}
export interface VoiceTranscriberOptions {
    readonly source: MediaSource;
    readonly endpoint: string;
    readonly token: string;
    readonly maxBytes: number;
    readonly maxSeconds: number;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
}
export declare class TelegramVoiceTranscriber implements VoiceTranscriber {
    private readonly options;
    constructor(options: VoiceTranscriberOptions);
    transcribe(voice: VoiceNote): Promise<VoiceResult>;
}
//# sourceMappingURL=voice.d.ts.map