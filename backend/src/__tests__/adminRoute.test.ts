import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { FirebaseUserAdmin } from '../routes/admin.js';
import { testAuthDeps, bearer, TEST_ADMIN, TEST_USER } from './testAuth.js';

function createFakeFirebaseUserAdmin(): FirebaseUserAdmin & {
  users: Map<string, { email: string; disabled: boolean }>;
} {
  const users = new Map<string, { email: string; disabled: boolean }>();
  let nextId = 1;
  return {
    users,
    createUser: vi.fn(async ({ email }) => {
      const uid = `fake-uid-${nextId++}`;
      users.set(uid, { email, disabled: false });
      return { uid };
    }),
    setCustomUserClaims: vi.fn(async () => {}),
    updateUser: vi.fn(async (uid, patch) => {
      const existing = users.get(uid);
      if (existing) users.set(uid, { ...existing, ...patch });
    }),
    deleteUser: vi.fn(async (uid) => {
      users.delete(uid);
    }),
  };
}

function buildApp(firebaseUserAdmin: FirebaseUserAdmin = createFakeFirebaseUserAdmin()) {
  const app = createApp({ ...testAuthDeps(), config: { rateLimitWindowMs: 60_000, rateLimitMax: 1000 }, firebaseUserAdmin });
  return { app, firebaseUserAdmin };
}

const NEW_ACCOUNT_QUOTAS = { maxFilms: 5, maxProjects: 5, maxConcurrentAgentRuns: 5 };

describe('admin routes require the admin role', () => {
  it('returns 403 for TEST_USER on every /api/admin/* route', async () => {
    const { app } = buildApp();

    const checks = [
      request(app).get('/api/admin/accounts').set(bearer(TEST_USER.uid)),
      request(app)
        .post('/api/admin/accounts')
        .set(bearer(TEST_USER.uid))
        .send({ email: 'x@test.dev', password: 'secretpw', label: 'X', role: 'user', quotas: NEW_ACCOUNT_QUOTAS }),
      request(app).patch('/api/admin/accounts/some-uid').set(bearer(TEST_USER.uid)).send({ disabled: true }),
      request(app).delete('/api/admin/accounts/some-uid').set(bearer(TEST_USER.uid)),
      request(app).get('/api/admin/killswitch').set(bearer(TEST_USER.uid)),
      request(app).post('/api/admin/killswitch').set(bearer(TEST_USER.uid)).send({ enabled: true }),
      request(app).get('/api/admin/activity').set(bearer(TEST_USER.uid)),
    ];

    const results = await Promise.all(checks);
    for (const res of results) expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/accounts', () => {
  it('creates a Firebase Auth user, sets the role claim, and provisions the account', async () => {
    const { app, firebaseUserAdmin } = buildApp();

    const res = await request(app)
      .post('/api/admin/accounts')
      .set(bearer(TEST_ADMIN.uid))
      .send({ email: 'newbie@test.dev', password: 'secretpw', label: 'Newbie', role: 'user', quotas: NEW_ACCOUNT_QUOTAS });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'newbie@test.dev', label: 'Newbie', role: 'user', quotas: NEW_ACCOUNT_QUOTAS, callCount24h: 0 });
    expect(firebaseUserAdmin.createUser).toHaveBeenCalledWith({ email: 'newbie@test.dev', password: 'secretpw' });
    expect(firebaseUserAdmin.setCustomUserClaims).toHaveBeenCalledWith(res.body.uid, { role: 'user' });
  });
});

describe('GET /api/admin/accounts', () => {
  it('lists provisioned accounts, including newly created ones', async () => {
    const { app } = buildApp();
    const created = await request(app)
      .post('/api/admin/accounts')
      .set(bearer(TEST_ADMIN.uid))
      .send({ email: 'listed@test.dev', password: 'secretpw', label: 'Listed', role: 'user', quotas: NEW_ACCOUNT_QUOTAS });

    const res = await request(app).get('/api/admin/accounts').set(bearer(TEST_ADMIN.uid));

    expect(res.status).toBe(200);
    expect(res.body.accounts.map((a: { uid: string }) => a.uid)).toContain(created.body.uid);
  });
});

describe('PATCH /api/admin/accounts/:uid', () => {
  it('updates the account and calls the fake Firebase Auth updateUser for disabled', async () => {
    const { app, firebaseUserAdmin } = buildApp();
    const created = await request(app)
      .post('/api/admin/accounts')
      .set(bearer(TEST_ADMIN.uid))
      .send({ email: 'todisable@test.dev', password: 'secretpw', label: 'ToDisable', role: 'user', quotas: NEW_ACCOUNT_QUOTAS });

    const res = await request(app).patch(`/api/admin/accounts/${created.body.uid}`).set(bearer(TEST_ADMIN.uid)).send({ disabled: true });

    expect(res.status).toBe(200);
    expect(res.body.disabled).toBe(true);
    expect(firebaseUserAdmin.updateUser).toHaveBeenCalledWith(created.body.uid, { disabled: true });
  });
});

describe('DELETE /api/admin/accounts/:uid', () => {
  it('removes the account', async () => {
    const { app } = buildApp();
    const created = await request(app)
      .post('/api/admin/accounts')
      .set(bearer(TEST_ADMIN.uid))
      .send({ email: 'todelete@test.dev', password: 'secretpw', label: 'ToDelete', role: 'user', quotas: NEW_ACCOUNT_QUOTAS });

    const del = await request(app).delete(`/api/admin/accounts/${created.body.uid}`).set(bearer(TEST_ADMIN.uid));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/admin/accounts').set(bearer(TEST_ADMIN.uid));
    expect(list.body.accounts.map((a: { uid: string }) => a.uid)).not.toContain(created.body.uid);
  });
});

describe('GET/POST /api/admin/killswitch', () => {
  it('round-trips killswitch state', async () => {
    const { app } = buildApp();

    const initial = await request(app).get('/api/admin/killswitch').set(bearer(TEST_ADMIN.uid));
    expect(initial.status).toBe(200);
    expect(initial.body.enabled).toBe(false);

    const set = await request(app)
      .post('/api/admin/killswitch')
      .set(bearer(TEST_ADMIN.uid))
      .send({ enabled: true, reason: 'cost cap hit' });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ enabled: true, reason: 'cost cap hit', setBy: TEST_ADMIN.uid });

    const fetched = await request(app).get('/api/admin/killswitch').set(bearer(TEST_ADMIN.uid));
    expect(fetched.body).toMatchObject({ enabled: true, reason: 'cost cap hit' });
  });
});

describe('GET /api/admin/activity', () => {
  it('returns logged entries from real authenticated requests', async () => {
    const { app } = buildApp();
    // Any authenticated request logs a call entry via callLoggingMiddleware.
    await request(app).get('/api/admin/killswitch').set(bearer(TEST_ADMIN.uid));
    await request(app).get('/api/admin/accounts').set(bearer(TEST_ADMIN.uid));

    const res = await request(app).get('/api/admin/activity').set(bearer(TEST_ADMIN.uid));

    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(2);
    expect(res.body.entries[0]).toMatchObject({ uid: TEST_ADMIN.uid, role: 'admin' });
  });
});
