import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';

function buildTestApp(max: number) {
  const app = express();
  app.use(rateLimitMiddleware({ windowMs: 60_000, max }));
  app.get('/limited', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('rateLimitMiddleware', () => {
  it('allows requests under the configured limit', async () => {
    const app = buildTestApp(2);
    const res1 = await request(app).get('/limited');
    const res2 = await request(app).get('/limited');
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('returns 429 after exceeding the limit for the same IP within the window', async () => {
    const app = buildTestApp(1);
    await request(app).get('/limited');
    const res = await request(app).get('/limited');
    expect(res.status).toBe(429);
  });
});
