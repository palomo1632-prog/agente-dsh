/**
 * Choosing which size of a photo to store.
 *
 * The harness attachment seam refuses an image whose longest side is over
 * `maxImageDimension` — 2000 pixels by default. Every modern phone screenshot
 * is over it: 1179×2556 on an iPhone, 1080×2400 on most Android. Taking the
 * largest size Telegram offers, which is what "best quality" naively means,
 * therefore fails for the single most common thing anyone sends a bot.
 *
 * Telegram already solves this. A photo arrives as several rendered sizes, and
 * one of the smaller ones is almost always both within the limit and far more
 * than a model needs to read a receipt. So the largest size that fits is the
 * one to send, and the rest are kept as fallbacks: the limit is the harness's
 * to change, so a rejection is answered by stepping down rather than by
 * trusting the number this side read.
 */
/**
 * What to assume when the seam publishes nothing.
 *
 * The harness's own default, so a store that keeps its limits to itself is
 * still met with a sensible guess rather than with the smallest thumbnail
 * Telegram has — which is 90 pixels wide and legible to nobody. A guess is
 * safe here because it only decides what to try first: a refusal steps down.
 */
export const ASSUMED_IMAGE_LIMITS = { maxImageDimension: 2000 };
/**
 * Order candidates by which to try first.
 *
 * Everything known to fit comes first, largest of those leading, because a
 * bigger image is easier to read. Everything else follows in ascending order,
 * so a blind attempt starts with the one most likely to be accepted.
 *
 * @param candidates - the sizes available, in any order.
 * @param limits - the seam's limits; absent falls back to
 *   {@link ASSUMED_IMAGE_LIMITS} rather than to knowing nothing.
 * @returns the same candidates, best first.
 */
export function orderBySuitability(candidates, limits) {
    const applied = limits ?? ASSUMED_IMAGE_LIMITS;
    const byArea = [...candidates].sort((a, b) => area(a) - area(b));
    const fits = byArea.filter((candidate) => withinLimits(candidate, applied));
    const rest = byArea.filter((candidate) => !withinLimits(candidate, applied));
    return [...fits.reverse(), ...rest];
}
/**
 * Whether a candidate's dimensions are known to be acceptable.
 *
 * Unknown dimensions are not treated as fitting: a document arrives with none,
 * and claiming it fits would put it ahead of a size that demonstrably does.
 */
export function withinLimits(candidate, limits) {
    const { width, height } = candidate;
    if (width === undefined || height === undefined)
        return false;
    if (limits === undefined)
        return false;
    if (limits.maxImageDimension !== undefined && Math.max(width, height) > limits.maxImageDimension) {
        return false;
    }
    if (limits.maxImagePixels !== undefined && width * height > limits.maxImagePixels)
        return false;
    return true;
}
/**
 * Whether a failure means "this image is too big", rather than anything else.
 *
 * Only these are worth retrying at a smaller size; a malformed file or a full
 * disk would fail identically however small the image was.
 *
 * @param error - whatever the attachment seam threw.
 */
export function isTooLarge(error) {
    const code = error?.code;
    if (code === 'IMAGE_DIMENSION_TOO_LARGE' || code === 'IMAGE_TOO_MANY_PIXELS')
        return true;
    // The code is the contract, but a seam that reports only a message should
    // still step down rather than give up.
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /pixel limit|too many pixels|dimension/i.test(message);
}
/** Say how big an image was and what it may be, for a refusal that helps. */
export function describeSize(candidate, limits) {
    const dimension = limits?.maxImageDimension;
    if (dimension === undefined)
        return undefined;
    const measured = candidate?.width !== undefined && candidate.height !== undefined
        ? `${candidate.width}×${candidate.height} `
        : '';
    return `That image ${measured}is larger than this harness stores — the limit is ${dimension} pixels per side.`;
}
/** Pixels, or zero where Telegram reported no dimensions. */
function area(candidate) {
    if (candidate.width === undefined || candidate.height === undefined)
        return 0;
    return candidate.width * candidate.height;
}
//# sourceMappingURL=limits.js.map