/**
 * What is installed here, and what is published.
 *
 * The question behind "should there be an /update" is really "am I behind?",
 * and that one can be answered without any of the risk. Updating the harness
 * takes effect only after a restart, and restarting it from inside a plugin
 * running in it kills the process answering you — with nothing to bring it
 * back on a machine with no supervisor. So this reports, and the person
 * decides when and where to act on it.
 *
 * Both halves degrade quietly. A version that cannot be read reports as
 * unknown, and a registry that cannot be reached simply says nothing about
 * what is published; neither is worth failing a command over.
 */
/** One package's installed and published versions. */
export interface VersionReport {
    readonly name: string;
    readonly installed: string;
    readonly latest?: string;
    /** Whether what is published is newer than what is installed. */
    readonly behind: boolean;
}
/** Fetching, injected so tests need no network. */
export type FetchLike = (url: string, init: {
    signal: AbortSignal;
}) => Promise<{
    ok: boolean;
    json(): Promise<unknown>;
}>;
/** Construction options. */
export interface VersionCheckOptions {
    readonly fetchImpl?: FetchLike;
    readonly cacheMs?: number;
    readonly timeoutMs?: number;
    readonly now?: () => number;
}
export declare class VersionCheck {
    private readonly options;
    private readonly cache;
    constructor(options?: VersionCheckOptions);
    /**
     * Compare one installed version against what npm publishes.
     *
     * @param name - the package name.
     * @param installed - the version running here.
     */
    check(name: string, installed: string): Promise<VersionReport>;
    /** The published version, from cache when it is fresh enough. */
    private latest;
    /** Ask the registry, and say nothing if it cannot be reached. */
    private ask;
}
/**
 * Compare two semantic versions.
 *
 * Prereleases are the reason this is written out rather than compared as
 * strings: the harness ships as `0.1.0-rc.8`, and `"0.1.0-rc.8" < "0.1.0-rc.10"`
 * is false as text and true as versions.
 *
 * @returns negative when `a` is older, positive when newer, zero when equal.
 */
export declare function compareVersions(a: string, b: string): number;
//# sourceMappingURL=versions.d.ts.map