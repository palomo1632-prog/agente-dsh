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
/** How long a registry answer is good for. Long enough that /diag is free. */
const CACHE_MS = 60 * 60 * 1000;
/** How long to wait on the registry before giving up on it. */
const TIMEOUT_MS = 4000;
export class VersionCheck {
    options;
    cache = new Map();
    constructor(options = {}) {
        this.options = options;
    }
    /**
     * Compare one installed version against what npm publishes.
     *
     * @param name - the package name.
     * @param installed - the version running here.
     */
    async check(name, installed) {
        const latest = await this.latest(name);
        return {
            name,
            installed,
            ...(latest === undefined ? {} : { latest }),
            behind: latest !== undefined && compareVersions(installed, latest) < 0,
        };
    }
    /** The published version, from cache when it is fresh enough. */
    async latest(name) {
        const now = this.options.now?.() ?? Date.now();
        const cached = this.cache.get(name);
        if (cached && now - cached.at < (this.options.cacheMs ?? CACHE_MS))
            return cached.latest;
        const latest = await this.ask(name);
        this.cache.set(name, { at: now, latest });
        return latest;
    }
    /** Ask the registry, and say nothing if it cannot be reached. */
    async ask(name) {
        const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
        if (fetchImpl === undefined)
            return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? TIMEOUT_MS);
        try {
            // The `latest` dist-tag endpoint rather than the full document: a
            // package's full metadata can be megabytes, and only one field is wanted.
            const response = await fetchImpl(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`, { signal: controller.signal });
            if (!response.ok)
                return undefined;
            const body = (await response.json());
            return typeof body.version === 'string' ? body.version : undefined;
        }
        catch {
            return undefined;
        }
        finally {
            clearTimeout(timer);
        }
    }
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
export function compareVersions(a, b) {
    const [coreA = '', preA = ''] = splitPrerelease(a);
    const [coreB = '', preB = ''] = splitPrerelease(b);
    const numbersA = coreA.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const numbersB = coreB.split('.').map((part) => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(numbersA.length, numbersB.length); index += 1) {
        const difference = (numbersA[index] ?? 0) - (numbersB[index] ?? 0);
        if (difference !== 0)
            return difference;
    }
    // A release outranks any prerelease of the same core: 1.0.0 beats 1.0.0-rc.9.
    if (preA === '' && preB === '')
        return 0;
    if (preA === '')
        return 1;
    if (preB === '')
        return -1;
    return comparePrerelease(preA, preB);
}
/** Split `1.2.3-rc.4` into its core and its prerelease. */
function splitPrerelease(version) {
    const trimmed = version.trim().replace(/^v/, '').split('+')[0] ?? '';
    const dash = trimmed.indexOf('-');
    return dash === -1 ? [trimmed, ''] : [trimmed.slice(0, dash), trimmed.slice(dash + 1)];
}
/** Compare prerelease tags dot-part by dot-part, numbers numerically. */
function comparePrerelease(a, b) {
    const partsA = a.split('.');
    const partsB = b.split('.');
    for (let index = 0; index < Math.max(partsA.length, partsB.length); index += 1) {
        const one = partsA[index];
        const two = partsB[index];
        // A shorter prerelease sorts first: rc.1 is older than rc.1.1.
        if (one === undefined)
            return -1;
        if (two === undefined)
            return 1;
        if (one === two)
            continue;
        const numericOne = /^\d+$/.test(one);
        const numericTwo = /^\d+$/.test(two);
        // Numeric parts compare as numbers, and always sort below alphanumeric.
        if (numericOne && numericTwo)
            return Number(one) - Number(two);
        if (numericOne)
            return -1;
        if (numericTwo)
            return 1;
        return one < two ? -1 : 1;
    }
    return 0;
}
//# sourceMappingURL=versions.js.map