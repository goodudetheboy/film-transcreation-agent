import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { passcodeMiddleware } from '../middleware/passcode.js';

function buildTestApp(expected: string) {
  const app = express();
  app.use(express.json());
  app.use(passcodeMiddleware(expected));
  app.post('/protected', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('passcodeMiddleware', () => {
  it('rejects request with missing passcode', async () => {
    const app = buildTestApp('secret');
    const res = await request(app).post('/protected').send({});
    expect(res.status).toBe(401);
  });

  it('rejects request with wrong passcode', async () => {
    const app = buildTestApp('secret');
    const res = await request(app).post('/protected').send({ passcode: 'nope' });
    expect(res.status).toBe(401);
  });

  it('calls next() when passcode matches', async () => {
    const app = buildTestApp('secret');
    const res = await request(app).post('/protected').send({ passcode: 'secret' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
