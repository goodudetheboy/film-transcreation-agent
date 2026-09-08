import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { killswitchMiddleware } from '../middleware/killswitch.js';
import { createInMemoryKillswitchStore } from '../services/killswitchStore.js';

function buildTestApp(killswitchStore: ReturnType<typeof createInMemoryKillswitchStore>) {
  const app = express();
  app.use(express.json());
  app.use(killswitchMiddleware(killswitchStore));
  app.get('/api/films', (_req, res) => res.status(200).json({ ok: true }));
  app.get('/api/admin/accounts', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('killswitchMiddleware', () => {
  it('lets a request through when the killswitch is off', async () => {
    const store = createInMemoryKillswitchStore({ enabled: false, reason: null, setBy: null, setAt: null });
    const app = buildTestApp(store);
    const res = await request(app).get('/api/films');
    expect(res.status).toBe(200);
  });

  it('503s a non-admin path when the killswitch is on', async () => {
    const store = createInMemoryKillswitchStore({ enabled: true, reason: 'cost cap hit', setBy: 'admin-uid', setAt: '2026-01-01T00:00:00.000Z' });
    const app = buildTestApp(store);
    const res = await request(app).get('/api/films');
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('cost cap hit');
  });

  it('still reaches next() for a path starting with /api/admin when the killswitch is on', async () => {
    const store = createInMemoryKillswitchStore({ enabled: true, reason: null, setBy: 'admin-uid', setAt: '2026-01-01T00:00:00.000Z' });
    const app = buildTestApp(store);
    const res = await request(app).get('/api/admin/accounts');
    expect(res.status).toBe(200);
  });
});
