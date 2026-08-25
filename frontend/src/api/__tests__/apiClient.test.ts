// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { streamAnalyze, verifyPasscode, preprocessVideo } from '../apiClient';
import type { AgentEvent, GestureLog } from '../apiClient.types';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

function fakeFetch(status: number, body: ReadableStream<Uint8Array> | null, textBody = '') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
    text: vi.fn().mockResolvedValue(textBody),
  } as unknown as Response);
}

describe('streamAnalyze', () => {
  it('parses a single data: line into a typed progress event', async () => {
    const frame = `data: ${JSON.stringify({ type: 'progress', message: 'go' })}\n\n`;
    const fetchImpl = fakeFetch(200, streamFromChunks([frame]));
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'p', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([{ type: 'progress', message: 'go' }]);
  });

  it('parses multiple SSE frames separated by blank lines into multiple onEvent calls', async () => {
    const f1 = `data: ${JSON.stringify({ type: 'progress', message: 'go' })}\n\n`;
    const f2 = `data: ${JSON.stringify({ type: 'done', summary: { totalFlagged: 0 } })}\n\n`;
    const fetchImpl = fakeFetch(200, streamFromChunks([f1 + f2]));
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'p', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events.map((e) => e.type)).toEqual(['progress', 'done']);
  });

  it('correctly reassembles an SSE event whose bytes are split across two chunk reads', async () => {
    const full = `data: ${JSON.stringify({ type: 'progress', message: 'go' })}\n\n`;
    const mid = Math.floor(full.length / 2);
    const fetchImpl = fakeFetch(200, streamFromChunks([full.slice(0, mid), full.slice(mid)]));
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'p', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([{ type: 'progress', message: 'go' }]);
  });

  it('stops reading after a done event', async () => {
    const done = `data: ${JSON.stringify({ type: 'done', summary: { totalFlagged: 0 } })}\n\n`;
    const extra = `data: ${JSON.stringify({ type: 'progress', message: 'should not appear' })}\n\n`;
    const fetchImpl = fakeFetch(200, streamFromChunks([done, extra]));
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'p', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([{ type: 'done', summary: { totalFlagged: 0 } }]);
  });

  it('surfaces a non-200 backend response as an error-shaped event', async () => {
    const fetchImpl = fakeFetch(401, null);
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'wrong', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('401') }]);
  });

  it("includes the backend's JSON error detail in the message when present", async () => {
    const fetchImpl = fakeFetch(401, null, JSON.stringify({ error: 'invalid passcode' }));
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'wrong', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([
      { type: 'error', message: 'request failed with status 401: invalid passcode' },
    ]);
  });

  it('falls back to the raw response text when the error body is not JSON', async () => {
    const fetchImpl = fakeFetch(429, null, 'Too many requests, please try again later.');
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'p', testMode: true },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([
      {
        type: 'error',
        message: 'request failed with status 429: Too many requests, please try again later.',
      },
    ]);
  });

  it('POSTs script, targetCountry, passcode and testMode as JSON in the request body', async () => {
    const fetchImpl = fakeFetch(200, streamFromChunks([]));
    await streamAnalyze(
      { script: 'a script', targetCountry: 'Japan', passcode: 'secret', testMode: false },
      () => {},
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          script: 'a script',
          targetCountry: 'Japan',
          passcode: 'secret',
          testMode: false,
        }),
      }),
    );
  });
});

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
    const fetchImpl = fakeJsonFetch(200, { lines: [] });
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

  it('resolves with the gesture logs on success', async () => {
    const lines: GestureLog[] = [
      { timecode: '00:00', gesture: 'thumbs up', character: 'RILEY', narrativeLoad: 'incidental', backgroundNote: '' },
    ];
    const fetchImpl = fakeJsonFetch(200, { lines });
    const result = await preprocessVideo(
      { videoUrl: 'gs://bucket/clip.mp4', passcode: 'secret', testMode: true },
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(result).toEqual({ ok: true, lines });
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
