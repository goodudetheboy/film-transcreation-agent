import type { AppDeps } from '../../../backend/src/app';
import { createInMemoryAccountStore, type Account } from '../../../backend/src/services/accountStore';

/** Test-only fake identity for the integration layer — mirrors
 * backend/src/__tests__/testAuth.ts's pattern exactly. The "token" a test
 * sends is just the account's uid; `integrationAuthDeps`'s fake verifier
 * trusts it directly. Real auth (Firebase ID token verification) is only
 * ever faked here the same way videoBucketUploader/discoveryAgent already
 * are elsewhere in this test layer — see CLAUDE.md. */
export const TEST_ADMIN: Account = {
  uid: 'itest-admin-uid',
  email: 'admin@itest.dev',
  role: 'admin',
  label: 'Integration Admin',
  quotas: { maxFilms: 999, maxProjects: 999, maxConcurrentAgentRuns: 999 },
  disabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'itest-admin-uid',
};

/** Pass to startTestBackend({ ...integrationAuthDeps(), ...otherDeps }). */
export function integrationAuthDeps(accounts: Account[] = [TEST_ADMIN]): Pick<AppDeps, 'verifyIdToken' | 'accountStore'> {
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
