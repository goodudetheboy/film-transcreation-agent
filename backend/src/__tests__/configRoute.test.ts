import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { DEFAULT_RUBRICS } from '../config/defaultRubrics.js';
import { testAuthDeps, bearer, TEST_ADMIN } from './testAuth.js';

describe('GET /api/default-rubrics', () => {
  it('returns the server default rubric set', async () => {
    const app = createApp({ ...testAuthDeps(), config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000 } });
    const res = await request(app).get('/api/default-rubrics').set(bearer(TEST_ADMIN.uid));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_RUBRICS);
  });

  it('is behind the auth gate', async () => {
    const app = createApp({ ...testAuthDeps(), config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000 } });
    const res = await request(app).get('/api/default-rubrics');
    expect(res.status).toBe(401);
  });
});
