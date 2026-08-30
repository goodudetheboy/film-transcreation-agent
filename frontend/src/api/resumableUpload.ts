/**
 * Uploads a File directly to a GCS resumable-upload session URL, in chunks,
 * bypassing Cloud Run's 32MB request-size limit entirely (the browser talks to
 * storage.googleapis.com, not the backend). Implements Google's documented
 * resumable-upload chunk protocol: https://cloud.google.com/storage/docs/performing-resumable-uploads
 *
 * "Resumable" here means auto-retry-and-resume within this single call (a wifi
 * blip mid-transfer resumes from the last confirmed byte) — not persistence
 * across page reloads.
 */

// Must be a multiple of GCS's required 256KiB chunk-boundary.
const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_ATTEMPTS_PER_CHUNK = 3;
const RETRY_DELAYS_MS = [500, 1500, 4000];

export interface UploadFileResumableOptions {
  onProgress?: (fraction: number) => void;
  fetchImpl?: typeof fetch;
  /** Overridable for tests only — production callers should never need this. */
  sleepImpl?: (ms: number) => Promise<void>;
}

function contentRangeHeader(start: number, end: number, total: number): string {
  return `bytes ${start}-${end - 1}/${total}`;
}

/** Asks GCS how many bytes of this session it actually has, per the resumable-upload protocol. */
async function queryUploadedBytes(uploadUrl: string, totalSize: number, fetchImpl: typeof fetch): Promise<number> {
  const res = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Length': '0', 'Content-Range': `bytes */${totalSize}` },
  });
  if (res.status === 200 || res.status === 201) return totalSize; // already complete
  if (res.status !== 308) {
    throw new Error(`failed to query upload status (status ${res.status})`);
  }
  const range = res.headers.get('range'); // "bytes=0-X" or null if nothing received yet
  if (!range) return 0;
  const match = /bytes=0-(\d+)/.exec(range);
  return match ? Number(match[1]) + 1 : 0;
}

export async function uploadFileResumable(
  uploadUrl: string,
  file: File,
  { onProgress, fetchImpl = fetch, sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: UploadFileResumableOptions = {},
): Promise<void> {
  const total = file.size;
  let offset = 0;
  let attempt = 0;

  while (offset < total) {
    // Recomputed every iteration (not just once per chunk) since a status-check
    // after a failure can move `offset` forward without reaching the chunk's
    // original end, and the next attempt must target the updated range.
    const end = Math.min(offset + CHUNK_SIZE, total);

    try {
      const res = await fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(end - offset),
          'Content-Range': contentRangeHeader(offset, end, total),
        },
        body: file.slice(offset, end),
      });

      if (res.status === 308) {
        offset = end;
      } else if (res.status === 200 || res.status === 201) {
        offset = total;
      } else {
        throw new Error(`chunk upload failed (status ${res.status})`);
      }
      attempt = 0; // this chunk landed — the next one gets a fresh retry budget
      onProgress?.(offset / total);
    } catch (err) {
      attempt += 1;
      if (attempt >= MAX_ATTEMPTS_PER_CHUNK) throw err;
      await sleepImpl(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!);
      try {
        // The failed request may have actually landed server-side — ask GCS
        // for the true offset before retrying, rather than blindly resending.
        offset = await queryUploadedBytes(uploadUrl, total, fetchImpl);
      } catch {
        // Status check failed too (e.g. connection still down) — leave offset
        // where it was; the loop retries the same range next iteration.
      }
    }
  }
}
