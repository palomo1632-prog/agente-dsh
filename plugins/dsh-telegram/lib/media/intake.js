/**
 * Getting what the user sent into what the agent can read.
 *
 * Three kinds arrive and only two can go anywhere useful:
 *
 * - **Images** reach the model. The harness attachment seam accepts PNG,
 *   JPEG, WebP and GIF, commits the bytes durably, and hands back a reference
 *   the session log can carry — which is why a screenshot works at all.
 * - **Text documents** — a log, a stack trace, a source file — have no seam,
 *   but they do not need one: their content is text, so it is read and placed
 *   in the prompt where the model already looks.
 * - **Voice, audio and video** have neither. The harness explicitly defers
 *   them, so the honest answer is to say so rather than to accept the message
 *   and silently drop what it carried.
 *
 * Telegram sends an uncompressed image as a *document*, so kind is decided by
 * media type rather than by which field it arrived in.
 */
/** Media types the harness attachment seam accepts. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
/** Media types worth reading as text, beyond anything named `text/*`. */
const TEXT_TYPES = new Set([
    'application/json',
    'application/xml',
    'application/x-yaml',
    'application/yaml',
    'application/javascript',
    'application/typescript',
    'application/sql',
    'application/toml',
]);
/** Extensions that are text regardless of the type Telegram guessed. */
const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'log', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt',
    'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift', 'sh', 'bash', 'zsh', 'sql',
    'html', 'css', 'scss', 'xml', 'csv', 'diff', 'patch', 'lock',
]);
/**
 * Identify the media a message carries.
 *
 * @param message - the incoming Telegram message.
 * @returns the item, or undefined for a message carrying none.
 */
export function describeMedia(message) {
    if (message.photo && message.photo.length > 0) {
        // Every size is kept. The largest used to be taken outright, which is why
        // any full-height phone screenshot was refused: its long side is over the
        // seam's 2000-pixel limit, and a smaller rendering of the same photo was
        // sitting right there in the same message.
        const candidates = message.photo.map((size) => ({
            fileId: size.file_id,
            ...(size.width !== undefined ? { width: size.width } : {}),
            ...(size.height !== undefined ? { height: size.height } : {}),
            ...(size.file_size !== undefined ? { size: size.file_size } : {}),
        }));
        const largest = candidates[candidates.length - 1];
        if (!largest)
            return undefined;
        return {
            fileId: largest.fileId,
            kind: 'image',
            mediaType: 'image/jpeg',
            ...(largest.size !== undefined ? { size: largest.size } : {}),
            candidates,
        };
    }
    if (message.document) {
        const { file_id: fileId, file_name: name, mime_type: mediaType } = message.document;
        const kind = documentKind(mediaType, name);
        return {
            fileId,
            kind,
            ...(mediaType !== undefined ? { mediaType } : {}),
            ...(name !== undefined ? { name } : {}),
            describedAs: mediaType ?? 'file',
            // One size only: Telegram renders nothing for a file sent uncompressed,
            // which is exactly why sending a screenshot that way can fail where
            // sending it as a photo succeeds.
            ...(kind === 'image' ? { candidates: [{ fileId }] } : {}),
        };
    }
    if (message.voice) {
        return { fileId: message.voice.file_id, kind: 'unsupported', describedAs: 'a voice note' };
    }
    if (message.audio) {
        return { fileId: message.audio.file_id, kind: 'unsupported', describedAs: 'an audio file' };
    }
    if (message.video) {
        return { fileId: message.video.file_id, kind: 'unsupported', describedAs: 'a video' };
    }
    return undefined;
}
/** Whether a document is an image, readable text, or neither. */
function documentKind(mediaType, name) {
    if (mediaType && IMAGE_TYPES.has(mediaType))
        return 'image';
    if (mediaType && (mediaType.startsWith('text/') || TEXT_TYPES.has(mediaType)))
        return 'text';
    // Telegram often guesses application/octet-stream for source files, so the
    // extension is the better signal when the type says nothing useful.
    const extension = name?.split('.').pop()?.toLowerCase();
    if (extension && TEXT_EXTENSIONS.has(extension))
        return 'text';
    return 'unsupported';
}
/**
 * Whether the harness can store this image.
 *
 * @param mediaType - the type Telegram reported.
 */
export function isStorableImage(mediaType) {
    return mediaType !== undefined && IMAGE_TYPES.has(mediaType);
}
//# sourceMappingURL=intake.js.map