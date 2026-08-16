// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { streamAnalyze } from '../apiClient';
import type { AgentEvent } from '../apiClient.types';

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

function fakeFetch(status: number, body: ReadableStream<Uint8Array> | null) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body,
  } as unknown as Response);
}

describe('streamAnalyze', () => {
  it('parses a single data: line into a typed progress event', async () => {
    const frame = `data: ${JSON.stringify({ type: 'progress', message: 'go' })}\n\n`;
    const fetchImpl = fakeFetch(200, streamFromChunks([frame]));
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'p' },
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
      { script: 's', targetCountry: 'c', passcode: 'p' },
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
      { script: 's', targetCountry: 'c', passcode: 'p' },
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
      { script: 's', targetCountry: 'c', passcode: 'p' },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([{ type: 'done', summary: { totalFlagged: 0 } }]);
  });

  it('surfaces a non-200 backend response as an error-shaped event', async () => {
    const fetchImpl = fakeFetch(401, null);
    const events: AgentEvent[] = [];
    await streamAnalyze(
      { script: 's', targetCountry: 'c', passcode: 'wrong' },
      (e) => events.push(e),
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('401') }]);
  });

  it('POSTs script, targetCountry and passcode as JSON in the request body', async () => {
    const fetchImpl = fakeFetch(200, streamFromChunks([]));
    await streamAnalyze(
      { script: 'a script', targetCountry: 'Japan', passcode: 'secret' },
      () => {},
      { fetchImpl, baseUrl: 'http://x' },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ script: 'a script', targetCountry: 'Japan', passcode: 'secret' }),
      }),
    );
  });
});
