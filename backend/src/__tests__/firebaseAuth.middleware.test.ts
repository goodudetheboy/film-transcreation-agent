import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { firebaseAuthMiddleware, type VerifyIdToken } from '../middleware/firebaseAuth.js';
import { createInMemoryAccountStore, type Account } from '../services/accountStore.js';

const ENABLED_ACCOUNT: Account = {
  uid: 'uid-enabled',
  email: 'enabled@test.dev',
  role: 'user',
  label: 'Enabled User',
  quotas: { maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 10 },
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'test-admin-uid',
};

const DISABLED_ACCOUNT: Account = {
  ...ENABLED_ACCOUNT,
  uid: 'uid-disabled',
  email: 'disabled@test.dev',
  disabled: true,
};

function buildTestApp(opts: { verifyIdToken: VerifyIdToken; accounts?: Account[] }) {
  const accountStore = createInMemoryAccountStore(opts.accounts ?? [ENABLED_ACCOUNT, DISABLED_ACCOUNT]);
  const app = express();
  app.use(express.json());
  app.use(firebaseAuthMiddleware({ verifyIdToken: opts.verifyIdToken, accountStore }));
  app.get('/protected', (req, res) => res.status(200).json({ account: req.account }));
  return app;
}

function verifierFor(accounts: Account[]): VerifyIdToken {
  return async (token) => {
    const account = accounts.find((a) => a.uid === token);
    if (!account) throw new Error('invalid token');
    return { uid: account.uid, email: account.email, role: account.role };
  };
}

describe('firebaseAuthMiddleware', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const app = buildTestApp({ verifyIdToken: verifierFor([ENABLED_ACCOUNT, DISABLED_ACCOUNT]) });
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('returns 401 when verifyIdToken rejects the token', async () => {
    const app = buildTestApp({ verifyIdToken: async () => { throw new Error('bad token'); } });
    const res = await request(app).get('/protected').set('Authorization', 'Bearer whatever');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token verifies but no matching account is provisioned', async () => {
    const app = buildTestApp({ verifyIdToken: verifierFor([ENABLED_ACCOUNT]), accounts: [] });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${ENABLED_ACCOUNT.uid}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a disabled account', async () => {
    const app = buildTestApp({ verifyIdToken: verifierFor([ENABLED_ACCOUNT, DISABLED_ACCOUNT]) });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${DISABLED_ACCOUNT.uid}`);
    expect(res.status).toBe(403);
  });

  it('calls next() and sets req.account for a valid token and enabled account', async () => {
    const app = buildTestApp({ verifyIdToken: verifierFor([ENABLED_ACCOUNT, DISABLED_ACCOUNT]) });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${ENABLED_ACCOUNT.uid}`);
    expect(res.status).toBe(200);
    expect(res.body.account).toEqual(ENABLED_ACCOUNT);
  });
});
