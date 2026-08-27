// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { verifyPasscode, preprocessVideo } from '../apiClient';
import type { DialogueLine, GestureLog } from '../apiClient.types';

function fakeFetch(status: number, body: ReadableStream<Uint8Array> | null, textBody = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
    text: vi.fn().mockResolvedValue(textBody),
  } as unknown as Response);
}

describe('verifyPasscode', () => {
  it('resolves ok:true when the backend returns 200', async () => {
    const fetchImpl = fakeFetch(200, null);
    const result = await verifyPasscode('correct', { fetchImpl, baseUrl: 'http://x' });
    expect(result).toEqual({ ok: true });
  });

  it('POSTs the passcode as JSON to /api/verify-passcode', async () => {
    const fetchImpl = fakeFetch(200, null);
    await verifyPasscode('correct', { fetchImpl, baseUrl: 'http://x' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/verify-passcode',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ passcode: 'correct' }),
      }),
    );
  });

  it('resolves ok:false with the backend detail when the passcode is wrong', async () => {
    const fetchImpl = fakeFetch(401, null, JSON.stringify({ error: 'invalid passcode' }));
    const result = await verifyPasscode('wrong', { fetchImpl, baseUrl: 'http://x' });
    expect(result).toEqual({ ok: false, message: 'invalid passcode' });
  });
});

function fakeJsonFetch(status: number, jsonBody: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(jsonBody)),
  } as unknown as Response);
}

describe('preprocessVideo', () => {
  it('POSTs videoUrl, passcode and testMode as JSON to /api/preprocess-video', async () => {
    const fetchImpl = fakeJsonFetch(200, { dialogue: [], gestures: [] });
    await preprocessVideo(
      { videoUrl: 'gs://bucket/clip.mp4', passcode: 'secret', testMode: false },
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/preprocess-video',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ videoUrl: 'gs://bucket/clip.mp4', passcode: 'secret', testMode: false }),
      }),
    );
  });

  it('resolves with the dialogue and gesture logs on success', async () => {
    const dialogue: DialogueLine[] = [{ timecode: '00:00', character: 'RILEY', text: "You've got this." }];
    const gestures: GestureLog[] = [
      {
        timecode: '00:00',
        character: 'RILEY',
        gesture: 'thumbs up',
        expression: '',
        narrativeLoad: 'incidental',
        backgroundNote: '',
      },
    ];
    const fetchImpl = fakeJsonFetch(200, { dialogue, gestures });
    const result = await preprocessVideo(
      { videoUrl: 'gs://bucket/clip.mp4', passcode: 'secret', testMode: true },
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(result).toEqual({ ok: true, dialogue, gestures });
  });

  it('resolves ok:false with the backend detail on failure', async () => {
    const fetchImpl = fakeJsonFetch(500, { error: 'boom' });
    const result = await preprocessVideo(
      { videoUrl: 'gs://bucket/clip.mp4', passcode: 'secret', testMode: true },
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(result).toEqual({ ok: false, message: 'boom' });
  });
});
