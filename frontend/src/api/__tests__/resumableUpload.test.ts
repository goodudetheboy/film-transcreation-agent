// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { uploadFileResumable } from '../resumableUpload';

const UPLOAD_URL = 'https://storage.googleapis.com/upload/session-123';

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
    const CHUNK = 8 * 1024 * 1024;
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

  it('resumes from the offset GCS reports after a transient chunk failure', async () => {
    const total = 1000;
    let callCount = 0;
    const fetchImpl = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      callCount += 1;
      const range = (init.headers as Record<string, string>)['Content-Range'];
      if (callCount === 1 && range === `bytes 0-999/${total}`) {
        // First attempt at the (only) chunk fails outright.
        throw new Error('network blip');
      }
      if (range === `bytes */${total}`) {
        // Status-check: GCS says it actually already has the first 400 bytes.
        return { status: 308, headers: { get: (h: string) => (h === 'range' ? 'bytes=0-399' : null) } };
      }
      if (range === `bytes 400-999/${total}`) {
        return { status: 200, headers: { get: () => null } };
      }
      throw new Error(`unexpected Content-Range in test: ${range}`);
    });
    const onProgress = vi.fn();

    await uploadFileResumable(UPLOAD_URL, makeFile(total), {
      fetchImpl,
      onProgress,
      sleepImpl: vi.fn().mockResolvedValue(undefined),
    });

    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('throws after exhausting retries on a persistently failing chunk', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('gcs down'));

    await expect(
      uploadFileResumable(UPLOAD_URL, makeFile(1000), {
        fetchImpl,
        sleepImpl: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow();
  });
});
