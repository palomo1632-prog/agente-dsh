/**
 * Plugin configuration.
 *
 * The bot token is deliberately absent. Configuration carries a *reference* to
 * the credential (`tokenRef`), and the value lives with the harness credential
 * provider — so a profile config stays safe to read, sync, and show in a UI,
 * and rotating the token touches no file here.
 */
import Schema from '@deepseek-ai/schemastery';
/** Default credential reference for the bot token. */
export declare const DEFAULT_TOKEN_REF = "TELEGRAM_BOT_TOKEN";
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    tokenRef: Schema<string, string>;
    baseUrl: Schema<string, string>;
    allowFrom: Schema<number[], number[]>;
    cwd: Schema<string, string>;
    timeoutMs: Schema<number, number>;
    longPollSeconds: Schema<number, number>;
    streaming: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        throttleMs: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        throttleMs: Schema<number, number>;
    }>>;
    media: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        maxBytes: Schema<number, number>;
        maxTextChars: Schema<number, number>;
        speech: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>>;
        ocr: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>>;
        visionModel: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        maxBytes: Schema<number, number>;
        maxTextChars: Schema<number, number>;
        speech: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>>;
        ocr: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>>;
        visionModel: Schema<string, string>;
    }>>;
    agentPreset: Schema<string, string>;
    requireMentionInGroups: Schema<boolean, boolean>;
    permissionPreset: Schema<string, string>;
    screenshot: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
    }>>;
    reconnect: Schema<Schemastery.ObjectS<{
        baseDelayMs: Schema<number, number>;
        maxDelayMs: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        baseDelayMs: Schema<number, number>;
        maxDelayMs: Schema<number, number>;
    }>>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    tokenRef: Schema<string, string>;
    baseUrl: Schema<string, string>;
    allowFrom: Schema<number[], number[]>;
    cwd: Schema<string, string>;
    timeoutMs: Schema<number, number>;
    longPollSeconds: Schema<number, number>;
    streaming: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        throttleMs: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        throttleMs: Schema<number, number>;
    }>>;
    media: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
        maxBytes: Schema<number, number>;
        maxTextChars: Schema<number, number>;
        speech: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>>;
        ocr: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>>;
        visionModel: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
        maxBytes: Schema<number, number>;
        maxTextChars: Schema<number, number>;
        speech: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            endpoint: Schema<string, string>;
            tokenRef: Schema<string, string>;
            timeoutMs: Schema<number, number>;
            maxBytes: Schema<number, number>;
            maxSeconds: Schema<number, number>;
        }>>;
        ocr: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            languages: Schema<string, string>;
        }>>;
        visionModel: Schema<string, string>;
    }>>;
    agentPreset: Schema<string, string>;
    requireMentionInGroups: Schema<boolean, boolean>;
    permissionPreset: Schema<string, string>;
    screenshot: Schema<Schemastery.ObjectS<{
        enabled: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: Schema<boolean, boolean>;
    }>>;
    reconnect: Schema<Schemastery.ObjectS<{
        baseDelayMs: Schema<number, number>;
        maxDelayMs: Schema<number, number>;
    }>, Schemastery.ObjectT<{
        baseDelayMs: Schema<number, number>;
        maxDelayMs: Schema<number, number>;
    }>>;
}>>;
/** Resolved plugin configuration. */
export type TelegramConfig = ReturnType<typeof Config>;
//# sourceMappingURL=config.d.ts.map