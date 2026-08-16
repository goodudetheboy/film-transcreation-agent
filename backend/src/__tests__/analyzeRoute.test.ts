import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { DialogflowClient, FlaggedLine } from '../services/dialogflowClient.js';

const TEST_PASSCODE = 'test-passcode';

function fakeClient(result: FlaggedLine[] = []): DialogflowClient {
  return { analyzeScript: vi.fn().mockResolvedValue(result) };
}

function buildApp(
  dialogflowClient: DialogflowClient,
  overrides: { maxScriptLines?: number; mockDialogflowClient?: DialogflowClient } = {},
) {
  return createApp({
    config: {
      sharedPasscode: TEST_PASSCODE,
      maxScriptLines: overrides.maxScriptLines ?? 200,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      revealDelayMs: 0,
    },
    dialogflowClient,
    mockDialogflowClient: overrides.mockDialogflowClient,
  });
}

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

describe('POST /api/analyze', () => {
  it('returns 400 when script is missing', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, targetCountry: 'Japan', testMode: false });
    expect(res.status).toBe(400);
  });

  it('returns 400 when targetCountry is missing', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one', testMode: false });
    expect(res.status).toBe(400);
  });

  it('returns 400 when script exceeds maxScriptLines', async () => {
    const app = buildApp(fakeClient(), { maxScriptLines: 2 });
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'a\nb\nc\nd', targetCountry: 'Japan', testMode: false });
    expect(res.status).toBe(400);
  });

  it('returns 401 when passcode is wrong', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: 'wrong', script: 'line one', targetCountry: 'Japan', testMode: false });
    expect(res.status).toBe(401);
  });

  it('responds with Content-Type text/event-stream on a valid request', async () => {
    const app = buildApp(fakeClient([]));
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan', testMode: false });
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('writes a progress event then flagged-line events then a done event, in order', async () => {
    const app = buildApp(
      fakeClient([
        { line: 'This is worse than a trip to the DMV.', reason: 'DMV is US-specific', suggestedReplacement: 'This is worse than waiting for a train.' },
      ]),
    );
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan', testMode: false });

    const events = parseEvents(res.text);

    expect(events[0]).toMatchObject({ type: 'progress' });
    expect(events.some((e) => e.type === 'line_flagged')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalFlagged: 1 } });
  });

  it('ends the response after the done event', async () => {
    const app = buildApp(fakeClient([]));
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan', testMode: false });
    expect(res.text.trim().endsWith('}')).toBe(true);
  });

  describe('test mode', () => {
    it('defaults to test mode (mock client) when testMode is omitted, never touching the real dialogflowClient', async () => {
      const real = fakeClient([{ line: 'real', reason: 'real', suggestedReplacement: 'real' }]);
      const mock = fakeClient([{ line: 'mock', reason: 'mock', suggestedReplacement: 'mock' }]);
      const app = buildApp(real, { mockDialogflowClient: mock });

      const res = await request(app)
        .post('/api/analyze')
        .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan' });

      const events = parseEvents(res.text);
      expect(events.some((e) => e.type === 'line_flagged' && e.line.line === 'mock')).toBe(true);
      expect(real.analyzeScript).not.toHaveBeenCalled();
    });

    it('uses the mock client when testMode is explicitly true', async () => {
      const real = fakeClient([{ line: 'real', reason: 'real', suggestedReplacement: 'real' }]);
      const mock = fakeClient([{ line: 'mock', reason: 'mock', suggestedReplacement: 'mock' }]);
      const app = buildApp(real, { mockDialogflowClient: mock });

      await request(app)
        .post('/api/analyze')
        .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan', testMode: true });

      expect(mock.analyzeScript).toHaveBeenCalled();
      expect(real.analyzeScript).not.toHaveBeenCalled();
    });

    it('uses the real dialogflowClient when testMode is explicitly false, never touching the mock', async () => {
      const real = fakeClient([{ line: 'real', reason: 'real', suggestedReplacement: 'real' }]);
      const mock = fakeClient([{ line: 'mock', reason: 'mock', suggestedReplacement: 'mock' }]);
      const app = buildApp(real, { mockDialogflowClient: mock });

      const res = await request(app)
        .post('/api/analyze')
        .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan', testMode: false });

      const events = parseEvents(res.text);
      expect(events.some((e) => e.type === 'line_flagged' && e.line.line === 'real')).toBe(true);
      expect(mock.analyzeScript).not.toHaveBeenCalled();
    });
  });
});
