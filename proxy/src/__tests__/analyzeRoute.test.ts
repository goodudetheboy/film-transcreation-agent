import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { DialogflowClient, FlaggedLine } from '../services/dialogflowClient.js';

const TEST_PASSCODE = 'test-passcode';

function fakeClient(result: FlaggedLine[] = []): DialogflowClient {
  return { analyzeScript: vi.fn().mockResolvedValue(result) };
}

function buildApp(dialogflowClient: DialogflowClient, maxScriptLines = 200) {
  return createApp({
    config: {
      sharedPasscode: TEST_PASSCODE,
      maxScriptLines,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      revealDelayMs: 0,
    },
    dialogflowClient,
  });
}

describe('POST /api/analyze', () => {
  it('returns 400 when script is missing', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, targetCountry: 'Japan' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when targetCountry is missing', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when script exceeds maxScriptLines', async () => {
    const app = buildApp(fakeClient(), 2);
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'a\nb\nc\nd', targetCountry: 'Japan' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when passcode is wrong', async () => {
    const app = buildApp(fakeClient());
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: 'wrong', script: 'line one', targetCountry: 'Japan' });
    expect(res.status).toBe(401);
  });

  it('responds with Content-Type text/event-stream on a valid request', async () => {
    const app = buildApp(fakeClient([]));
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan' });
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
      .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan' });

    const events = res.text
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice('data: '.length)));

    expect(events[0]).toMatchObject({ type: 'progress' });
    expect(events.some((e) => e.type === 'line_flagged')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalFlagged: 1 } });
  });

  it('ends the response after the done event', async () => {
    const app = buildApp(fakeClient([]));
    const res = await request(app)
      .post('/api/analyze')
      .send({ passcode: TEST_PASSCODE, script: 'line one', targetCountry: 'Japan' });
    expect(res.text.trim().endsWith('}')).toBe(true);
  });
});
