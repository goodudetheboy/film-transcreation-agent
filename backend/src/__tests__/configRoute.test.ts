import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { DEFAULT_RUBRICS } from '../config/defaultRubrics.js';

const TEST_PASSCODE = 'test-passcode';

describe('GET /api/default-rubrics', () => {
  it('returns the server default rubric set', async () => {
    const app = createApp({ config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 } });
    const res = await request(app).get(`/api/default-rubrics?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_RUBRICS);
  });

  it('is behind the passcode gate', async () => {
    const app = createApp({ config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 } });
    const res = await request(app).get('/api/default-rubrics');
    expect(res.status).toBe(401);
  });
});
