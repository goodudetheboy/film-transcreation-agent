import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const TEST_PASSCODE = 'test-passcode';

function buildApp() {
  return createApp({
    config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
  });
}

describe('POST /api/verify-passcode', () => {
  it('returns 200 when the passcode matches', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/verify-passcode').send({ passcode: TEST_PASSCODE });
    expect(res.status).toBe(200);
  });

  it('returns 401 when the passcode is wrong', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/verify-passcode').send({ passcode: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the passcode is missing', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/verify-passcode').send({});
    expect(res.status).toBe(401);
  });
});
