// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { uploadFileResumable } from '../resumableUpload';

const UPLOAD_URL = 'https://storage.googleapis.com/upload/session-123';
const CHUNK = 8 * 1024 * 1024;

function makeFile(sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'clip.mp4', { type: 'video/mp4' });
}

describe('uploadFileResumable', () => {
  it('uploads a small (single-chunk) file with one PUT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null } });
    const onProgress = vi.fn();

    await uploadFileResumable(UPLOAD_URL, makeFile(1000), { fetchImpl, onProgress });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      UPLOAD_URL,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Length': '1000', 'Content-Range': 'bytes 0-999/1000' },
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('splits a multi-chunk file into 8MiB PUTs with correct Content-Range, reporting progress each time', async () => {
    const total = CHUNK * 2 + 100; // 3 chunks: full, full, remainder
    const fetchImpl = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const range = (init.headers as Record<string, string>)['Content-Range'];
      const isLast = range === `bytes ${CHUNK * 2}-${total - 1}/${total}`;
      return { status: isLast ? 200 : 308, headers: { get: () => null } };
    });
    const onProgress = vi.fn();

    await uploadFileResumable(UPLOAD_URL, makeFile(total), { fetchImpl, onProgress });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      UPLOAD_URL,
      expect.objectContaining({ headers: { 'Content-Length': String(CHUNK), 'Content-Range': `bytes 0-${CHUNK - 1}/${total}` } }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      UPLOAD_URL,
      expect.objectContaining({
        headers: { 'Content-Length': String(CHUNK), 'Content-Range': `bytes ${CHUNK}-${CHUNK * 2 - 1}/${total}` },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      UPLOAD_URL,
      expect.objectContaining({
        headers: { 'Content-Length': '100', 'Content-Range': `bytes ${CHUNK * 2}-${total - 1}/${total}` },
      }),
    );
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([CHUNK / total, (CHUNK * 2) / total, 1]);
  });

  it('resumes from the offset GCS reports after a transient failure on a non-final chunk', async () => {
    const total = CHUNK * 2 + 100; // multi-chunk, so the failing first chunk is not the final one
    let firstAttemptDone = false;

    const fetchImpl = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const range = (init.headers as Record<string, string>)['Content-Range'];

      const statusCheck = /^bytes \*\/(\d+)$/.exec(range);
      if (statusCheck) {
        // GCS says it actually already has the first 1MB of the chunk that just failed.
        return { status: 308, headers: { get: (h: string) => (h === 'range' ? 'bytes=0-1048575' : null) } };
      }

      const dataChunk = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
      if (!dataChunk) throw new Error(`unexpected Content-Range in test: ${range}`);
      const [, startStr, endStr] = dataChunk;

      if (startStr === '0' && !firstAttemptDone) {
        firstAttemptDone = true;
        throw new Error('network blip');
      }

      const isFinal = Number(endStr) + 1 >= total;
      return { status: isFinal ? 200 : 308, headers: { get: () => null } };
    });
    const onProgress = vi.fn();

    await uploadFileResumable(UPLOAD_URL, makeFile(total), {
      fetchImpl,
      onProgress,
      sleepImpl: vi.fn().mockResolvedValue(undefined),
    });

    // Resumed from byte 1,048,576 (per the status-check above) rather than
    // restarting from 0 — proves the resume-from-reported-offset path ran.
    expect(fetchImpl).toHaveBeenCalledWith(
      UPLOAD_URL,
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Range': `bytes 1048576-${1048576 + CHUNK - 1}/${total}` }) }),
    );
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('throws after exhausting retries on a persistently failing non-final chunk', async () => {
    const total = CHUNK * 2 + 100; // multi-chunk, so the failing first chunk is not the final one
    const fetchImpl = vi.fn().mockRejectedValue(new Error('gcs down'));

    await expect(
      uploadFileResumable(UPLOAD_URL, makeFile(total), {
        fetchImpl,
        sleepImpl: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow();
  });

  it('resolves (does not throw) when the final chunk fails — GCS never sends CORS headers on the completing response, so this is expected, not an error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const onProgress = vi.fn();

    // Should NOT throw, and should NOT retry the final chunk (a single-chunk
    // file's only chunk is always the final one).
    await uploadFileResumable(UPLOAD_URL, makeFile(1000), { fetchImpl, onProgress });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(1);
  });
});
