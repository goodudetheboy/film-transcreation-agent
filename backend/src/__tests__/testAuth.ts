import type { AppDeps } from '../app.js';
import { createInMemoryAccountStore, type Account } from '../services/accountStore.js';

/** Test-only fake identities — see app.ts's `verifyIdToken` dependency.
 * Real tokens are opaque JWTs verified by firebase-admin; here the "token" is
 * just the account's uid, and `testAuthDeps`'s verifier trusts it directly.
 * Never a real auth bypass — createApp()'s default `verifyIdToken` still
 * throws unless a test explicitly supplies one via this helper. */
export const TEST_ADMIN: Account = {
  uid: 'test-admin-uid',
  email: 'admin@test.dev',
  role: 'admin',
  label: 'Test Admin',
  quotas: { maxFilms: 999, maxProjects: 999, maxConcurrentAgentRuns: 999 },
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'test-admin-uid',
};

export const TEST_USER: Account = {
  uid: 'test-user-uid',
  email: 'user@test.dev',
  role: 'user',
  label: 'Test User',
  quotas: { maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 10 },
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'test-admin-uid',
};

/** Pass to createApp({ ...testAuthDeps() }) — defaults to TEST_ADMIN + TEST_USER
 * provisioned; pass a custom list to test quota edges or a disabled account. */
export function testAuthDeps(accounts: Account[] = [TEST_ADMIN, TEST_USER]): Pick<AppDeps, 'verifyIdToken' | 'accountStore'> {
  const accountStore = createInMemoryAccountStore(accounts);
  return {
    accountStore,
    verifyIdToken: async (token) => {
      const account = accounts.find((a) => a.uid === token);
      if (!account) throw new Error('invalid token');
      return { uid: account.uid, email: account.email, role: account.role };
    },
  };
}

/** `.set(bearer(TEST_USER.uid))` on a supertest request — replaces the old
 * `?passcode=`/`.send({passcode})` convention. */
export function bearer(uid: string): { Authorization: string } {
  return { Authorization: `Bearer ${uid}` };
}
