/**
 * Client-side file download helpers.
 *
 * Downloads use the existing authenticated `fetchBlob` flow (bearer token), so
 * we never need to attach tokens to a plain `<a href>`. `saveBlob` materializes
 * an object URL, triggers a download, and releases it.
 */

export function saveBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Release after the browser has had a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
