// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { uploadVideoFile } from '../filmsApiClient';

function makeFile(sizeBytes = 10): File {
  return new File([new Uint8Array(sizeBytes)], 'clip.mp4', { type: 'video/mp4' });
}

describe('uploadVideoFile', () => {
  it('mock mode POSTs multipart form data to /api/films/upload-video (unchanged behavior)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ videoUrl: 'http://x/mock-uploads/a.mp4?passcode=p' }),
    });

    const result = await uploadVideoFile(makeFile(), { passcode: 'p', testMode: true }, { fetchImpl, baseUrl: 'http://x' });

    expect(result).toEqual({ videoUrl: 'http://x/mock-uploads/a.mp4?passcode=p' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://x/api/films/upload-video?passcode=p');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('real mode calls init, PUTs directly to the session URL, then calls finalize to confirm completion', async () => {
    const file = makeFile(10);
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url === 'http://x/api/films/upload-video/init') {
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({
          passcode: 'p',
          filename: 'clip.mp4',
          contentType: 'video/mp4',
          size: 10,
          testMode: false,
        });
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ uploadUrl: 'https://storage.googleapis.com/upload/s1', videoUrl: 'gs://bucket/s1.mp4' }),
        };
      }
      if (url === 'https://storage.googleapis.com/upload/s1') {
        expect(init.method).toBe('PUT');
        // GCS's completing response never carries CORS headers in a real browser —
        // exercised here as a thrown network error, same as the browser would see.
        throw new TypeError('Failed to fetch');
      }
      if (url === 'http://x/api/films/upload-video/finalize') {
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({ passcode: 'p', videoUrl: 'gs://bucket/s1.mp4', testMode: false });
        return { ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true, size: 10 }) };
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    const onProgress = vi.fn();
    const result = await uploadVideoFile(file, { passcode: 'p', testMode: false }, { fetchImpl, baseUrl: 'http://x' }, onProgress);

    expect(result).toEqual({ videoUrl: 'gs://bucket/s1.mp4' });
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('real mode surfaces an error if the init call fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'video exceeds the upload limit' })),
    });

    await expect(
      uploadVideoFile(makeFile(), { passcode: 'p', testMode: false }, { fetchImpl, baseUrl: 'http://x' }),
    ).rejects.toThrow(/video exceeds the upload limit/);
  });

  it('real mode surfaces an error if finalize rejects the upload (e.g. oversized or never actually completed)', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/upload-video/init')) {
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ uploadUrl: 'https://storage.googleapis.com/upload/s1', videoUrl: 'gs://bucket/s1.mp4' }),
        };
      }
      if (url === 'https://storage.googleapis.com/upload/s1') {
        return { status: 200, headers: { get: () => null } };
      }
      if (url.endsWith('/upload-video/finalize')) {
        return { ok: false, status: 404, text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'video upload has not finished yet' })) };
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(
      uploadVideoFile(makeFile(), { passcode: 'p', testMode: false }, { fetchImpl, baseUrl: 'http://x' }),
    ).rejects.toThrow(/video upload has not finished yet/);
  });
});
