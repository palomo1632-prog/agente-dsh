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
/** One rendered size of an image, as Telegram offers it. */
export interface ImageCandidate {
    readonly fileId: string;
    readonly width?: number;
    readonly height?: number;
    readonly size?: number;
}
/** The attachment seam's own limits, where it publishes them. */
export interface ImageLimits {
    readonly maxImageDimension?: number;
    readonly maxImagePixels?: number;
}
/**
 * What to assume when the seam publishes nothing.
 *
 * The harness's own default, so a store that keeps its limits to itself is
 * still met with a sensible guess rather than with the smallest thumbnail
 * Telegram has — which is 90 pixels wide and legible to nobody. A guess is
 * safe here because it only decides what to try first: a refusal steps down.
 */
export declare const ASSUMED_IMAGE_LIMITS: ImageLimits;
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
export declare function orderBySuitability(candidates: readonly ImageCandidate[], limits: ImageLimits | undefined): ImageCandidate[];
/**
 * Whether a candidate's dimensions are known to be acceptable.
 *
 * Unknown dimensions are not treated as fitting: a document arrives with none,
 * and claiming it fits would put it ahead of a size that demonstrably does.
 */
export declare function withinLimits(candidate: ImageCandidate, limits: ImageLimits | undefined): boolean;
/**
 * Whether a failure means "this image is too big", rather than anything else.
 *
 * Only these are worth retrying at a smaller size; a malformed file or a full
 * disk would fail identically however small the image was.
 *
 * @param error - whatever the attachment seam threw.
 */
export declare function isTooLarge(error: unknown): boolean;
/** Say how big an image was and what it may be, for a refusal that helps. */
export declare function describeSize(candidate: ImageCandidate | undefined, limits: ImageLimits | undefined): string | undefined;
//# sourceMappingURL=limits.d.ts.map