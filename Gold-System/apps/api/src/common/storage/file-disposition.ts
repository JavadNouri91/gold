/**
 * Safe Content-Disposition and filename helpers for authenticated file delivery.
 *
 * Never expose filesystem paths to clients. These helpers produce a single,
 * sanitized filename with an ASCII fallback and an RFC 5987 UTF-8 form so
 * Persian (or otherwise non-ASCII) filenames survive HTTP transport.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const UNSAFE_RE = /[\\/:"*?<>|]+/g;

/**
 * Reduce a stored/original filename to a single safe segment: strips control
 * characters, quotes, backslashes and path separators, collapses whitespace,
 * trims leading/trailing dots, and falls back when the result is empty.
 */
export function safeFileName(name: string | undefined | null, fallback = 'file'): string {
  const cleaned = (name ?? '')
    .split(/[\\/]+/)
    .pop()
    ?.replace(CONTROL_RE, '')
    .replace(UNSAFE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

/**
 * RFC 6266/5987 Content-Disposition value. Produces an ASCII fallback plus an
 * encoded UTF-8 `filename*` when they differ.
 */
export function contentDisposition(filename: string, disposition: 'inline' | 'attachment'): string {
  const safe = safeFileName(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
  const utf8 = encodeURIComponent(safe).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const base = `${disposition}; filename="${ascii}"`;
  if (ascii === safe) return base;
  return `${base}; filename*=UTF-8''${utf8}`;
}

export const inlineDisposition = (filename: string): string =>
  contentDisposition(filename, 'inline');

export const attachmentDisposition = (filename: string): string =>
  contentDisposition(filename, 'attachment');
