/**
 * Converts a `gs://bucket/object` URI to its public HTTPS equivalent so it can be
 * used as a <video>/<img> src. Only works for objects with public read access;
 * non-gs:// URLs are returned unchanged.
 */
export function toPlayableUrl(url: string): string {
  if (!url.startsWith('gs://')) return url;
  const path = url.slice('gs://'.length);
  return `https://storage.googleapis.com/${path}`;
}
