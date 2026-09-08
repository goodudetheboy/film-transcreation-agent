import type { Firestore } from '@google-cloud/firestore';
import type { Account, CreateAccountInput, UpdateAccountInput } from './accountTypes.js';

export type { Account, CreateAccountInput, UpdateAccountInput, AccountRole, AccountQuotas } from './accountTypes.js';

/**
 * Owns `accounts/{uid}` — one document per provisioned Firebase Auth user
 * (see docs/adr/0028). Doc id is the Firebase uid itself, not a random id,
 * since every lookup is by uid (the thing firebaseAuth.ts's token
 * verification hands back).
 */
export interface AccountStore {
  createAccount(input: CreateAccountInput): Promise<Account>;
  getAccount(uid: string): Promise<Account | undefined>;
  listAccounts(): Promise<Account[]>;
  updateAccount(uid: string, patch: UpdateAccountInput): Promise<Account | undefined>;
  deleteAccount(uid: string): Promise<boolean>;
}

const ACCOUNTS_COLLECTION = 'accounts';

function newAccount(input: CreateAccountInput, now: string): Account {
  return {
    uid: input.uid,
    email: input.email,
    role: input.role,
    label: input.label,
    quotas: input.quotas,
    disabled: false,
    createdAt: now,
    createdBy: input.createdBy,
  };
}

export function createFirestoreAccountStore(firestore: Firestore): AccountStore {
  const collection = firestore.collection(ACCOUNTS_COLLECTION);

  return {
    async createAccount(input) {
      const account = newAccount(input, new Date().toISOString());
      await collection.doc(account.uid).set(account);
      return account;
    },

    async getAccount(uid) {
      const doc = await collection.doc(uid).get();
      return doc.exists ? (doc.data() as Account) : undefined;
    },

    async listAccounts() {
      const snapshot = await collection.orderBy('createdAt', 'desc').get();
      return snapshot.docs.map((d) => d.data() as Account);
    },

    async updateAccount(uid, patch) {
      const ref = collection.doc(uid);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: Account = { ...(doc.data() as Account), ...patch };
      await ref.set(updated);
      return updated;
    },

    async deleteAccount(uid) {
      const ref = collection.doc(uid);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      return true;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryAccountStore(seed: Account[] = []): AccountStore {
  const accounts = new Map<string, Account>(seed.map((a) => [a.uid, a]));

  return {
    async createAccount(input) {
      const account = newAccount(input, new Date().toISOString());
      accounts.set(account.uid, account);
      return account;
    },

    async getAccount(uid) {
      return accounts.get(uid);
    },

    async listAccounts() {
      return [...accounts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async updateAccount(uid, patch) {
      const existing = accounts.get(uid);
      if (!existing) return undefined;
      const updated: Account = { ...existing, ...patch };
      accounts.set(uid, updated);
      return updated;
    },

    async deleteAccount(uid) {
      return accounts.delete(uid);
    },
  };
}
