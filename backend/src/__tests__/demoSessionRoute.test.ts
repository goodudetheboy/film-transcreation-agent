import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { DemoAuthAdmin } from '../routes/demoSession.js';
import { testAuthDeps } from './testAuth.js';

function fakeDemoAuthAdmin(overrides: Partial<DemoAuthAdmin> = {}): DemoAuthAdmin {
  return {
    getUidByEmail: vi.fn(async (email: string) => (email === 'demo@cinema.vietrochack.com' ? 'demo-uid' : undefined)),
    createCustomToken: vi.fn(async (uid: string) => `custom-token-for-${uid}`),
    ...overrides,
  };
}

describe('POST /api/demo-session', () => {
  it('mints a custom token for the configured demo account, unauthenticated', async () => {
    const app = createApp({
      ...testAuthDeps(),
      config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000, demoAccountEmail: 'demo@cinema.vietrochack.com' },
      demoAuthAdmin: fakeDemoAuthAdmin(),
    });
    const res = await request(app).post('/api/demo-session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'custom-token-for-demo-uid' });
  });

  it('is 503 when demoAccountEmail is not configured', async () => {
    const app = createApp({ ...testAuthDeps(), config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000 }, demoAuthAdmin: fakeDemoAuthAdmin() });
    const res = await request(app).post('/api/demo-session');
    expect(res.status).toBe(503);
  });

  it('is 503 when the configured demo account has not been provisioned in Firebase Auth', async () => {
    const app = createApp({
      ...testAuthDeps(),
      config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000, demoAccountEmail: 'nobody@nowhere.dev' },
      demoAuthAdmin: fakeDemoAuthAdmin(),
    });
    const res = await request(app).post('/api/demo-session');
    expect(res.status).toBe(503);
  });

  it('is 502 when minting the token fails', async () => {
    const app = createApp({
      ...testAuthDeps(),
      config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000, demoAccountEmail: 'demo@cinema.vietrochack.com' },
      demoAuthAdmin: fakeDemoAuthAdmin({
        createCustomToken: vi.fn(async () => {
          throw new Error('boom');
        }),
      }),
    });
    const res = await request(app).post('/api/demo-session');
    expect(res.status).toBe(502);
  });
});
