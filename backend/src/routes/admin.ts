import { Router } from 'express';
import type { AccountStore } from '../services/accountStore.js';
import type { AccountQuotas, AccountRole } from '../services/accountTypes.js';
import type { ApiCallLogStore } from '../services/apiCallLogStore.js';
import type { KillswitchStore } from '../services/killswitchStore.js';

/** Injectable wrapper around firebase-admin's Auth methods — see server.ts
 * for the real implementation. Kept minimal (just what this route needs),
 * same "inject only the external client, not the whole SDK" convention as
 * videoBucketUploader.ts. */
export interface FirebaseUserAdmin {
  createUser(input: { email: string; password: string }): Promise<{ uid: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  updateUser(uid: string, patch: { disabled?: boolean }): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

export interface AdminRouteDeps {
  accountStore: AccountStore;
  apiCallLogStore: ApiCallLogStore;
  killswitchStore: KillswitchStore;
  firebaseUserAdmin: FirebaseUserAdmin;
}

function isValidQuotas(value: unknown): value is AccountQuotas {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  return typeof q.maxFilms === 'number' && typeof q.maxProjects === 'number' && typeof q.maxConcurrentAgentRuns === 'number';
}

/** Mounted at the '/api/admin' prefix in app.ts (behind firebaseAuth, so
 * req.account is always set by the time these handlers run) — see
 * docs/adr/0028. Routes here are relative to that mount, NOT re-prefixed with
 * '/api/admin' — mounting with an explicit prefix means Express only ever
 * forwards already-'/api/admin/*'-scoped requests into this router at all, so
 * the router-level guard below can never intercept an unrelated route (a
 * router-wide `router.use(guard)` with no path matches every request that
 * flows into the router, so a prefix-less mount would have made this guard
 * 403 the entire app for non-admins — caught live-testing a demo account).
 * The guard is the only admin-role check; individual handlers don't repeat it. */
export function adminRoute(deps: AdminRouteDeps): Router {
  const router = Router();

  router.use((req, res, next) => {
    if (req.account?.role !== 'admin') {
      res.status(403).json({ error: 'admin only' });
      return;
    }
    next();
  });

  // ---- Accounts -------------------------------------------------------------

  router.get('/accounts', async (_req, res) => {
    const accounts = await deps.accountStore.listAccounts();
    const withActivity = await Promise.all(
      accounts.map(async (a) => ({ ...a, ...(await deps.apiCallLogStore.activityFor(a.uid)) })),
    );
    res.status(200).json({ accounts: withActivity });
  });

  router.post('/accounts', async (req, res) => {
    const { email, password, label, role, quotas } = req.body ?? {};
    if (typeof email !== 'string' || email.trim() === '') {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'password is required and must be at least 6 characters' });
      return;
    }
    if (typeof label !== 'string' || label.trim() === '') {
      res.status(400).json({ error: 'label is required' });
      return;
    }
    if (role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'role must be "admin" or "user"' });
      return;
    }
    if (!isValidQuotas(quotas)) {
      res.status(400).json({ error: 'quotas.maxFilms/maxProjects/maxConcurrentAgentRuns must all be numbers' });
      return;
    }

    let uid: string;
    try {
      const user = await deps.firebaseUserAdmin.createUser({ email, password });
      uid = user.uid;
      await deps.firebaseUserAdmin.setCustomUserClaims(uid, { role });
    } catch (err) {
      res.status(502).json({ error: `failed to create Firebase Auth user: ${err instanceof Error ? err.message : 'unknown error'}` });
      return;
    }

    const account = await deps.accountStore.createAccount({
      uid,
      email,
      role: role as AccountRole,
      label,
      quotas,
      createdBy: req.account!.uid,
    });
    res.status(201).json({ ...account, callCount24h: 0, lastCallAt: null, lastEndpoint: null });
  });

  router.patch('/accounts/:uid', async (req, res) => {
    const { label, role, quotas, disabled } = req.body ?? {};
    const patch: { label?: string; role?: AccountRole; quotas?: AccountQuotas; disabled?: boolean } = {};
    if (label !== undefined) {
      if (typeof label !== 'string' || label.trim() === '') {
        res.status(400).json({ error: 'label must be a non-empty string' });
        return;
      }
      patch.label = label;
    }
    if (role !== undefined) {
      if (role !== 'admin' && role !== 'user') {
        res.status(400).json({ error: 'role must be "admin" or "user"' });
        return;
      }
      patch.role = role;
    }
    if (quotas !== undefined) {
      if (!isValidQuotas(quotas)) {
        res.status(400).json({ error: 'quotas.maxFilms/maxProjects/maxConcurrentAgentRuns must all be numbers' });
        return;
      }
      patch.quotas = quotas;
    }
    if (disabled !== undefined) {
      if (typeof disabled !== 'boolean') {
        res.status(400).json({ error: 'disabled must be a boolean' });
        return;
      }
      patch.disabled = disabled;
    }

    try {
      if (patch.role !== undefined) await deps.firebaseUserAdmin.setCustomUserClaims(req.params.uid, { role: patch.role });
      // checkRevoked:true in firebaseAuth.ts makes this take effect on the caller's
      // very next request, not after their current token's remaining lifetime.
      if (patch.disabled !== undefined) await deps.firebaseUserAdmin.updateUser(req.params.uid, { disabled: patch.disabled });
    } catch (err) {
      res.status(502).json({ error: `failed to update Firebase Auth user: ${err instanceof Error ? err.message : 'unknown error'}` });
      return;
    }

    const updated = await deps.accountStore.updateAccount(req.params.uid, patch);
    if (!updated) {
      res.status(404).json({ error: 'account not found' });
      return;
    }
    const activity = await deps.apiCallLogStore.activityFor(updated.uid);
    res.status(200).json({ ...updated, ...activity });
  });

  router.delete('/accounts/:uid', async (req, res) => {
    try {
      await deps.firebaseUserAdmin.deleteUser(req.params.uid);
    } catch (err) {
      res.status(502).json({ error: `failed to delete Firebase Auth user: ${err instanceof Error ? err.message : 'unknown error'}` });
      return;
    }
    const deleted = await deps.accountStore.deleteAccount(req.params.uid);
    if (!deleted) {
      res.status(404).json({ error: 'account not found' });
      return;
    }
    res.status(204).end();
  });

  // ---- Killswitch -------------------------------------------------------------

  router.get('/killswitch', async (_req, res) => {
    res.status(200).json(await deps.killswitchStore.get());
  });

  router.post('/killswitch', async (req, res) => {
    const { enabled, reason } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const state = await deps.killswitchStore.set({
      enabled,
      reason: typeof reason === 'string' ? reason : null,
      setBy: req.account!.uid,
    });
    res.status(200).json(state);
  });

  // ---- Activity -------------------------------------------------------------

  router.get('/activity', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.status(200).json({ entries: await deps.apiCallLogStore.listRecent(limit) });
  });

  return router;
}
