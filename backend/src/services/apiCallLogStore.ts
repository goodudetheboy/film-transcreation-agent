import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';

export interface ApiCallLogEntry {
  id: string;
  uid: string;
  role: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  ts: string;
}

export interface AccountActivity {
  callCount24h: number;
  lastCallAt: string | null;
  lastEndpoint: string | null;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
/** Firestore TTL policy on this field prunes entries automatically — see
 * docs/adr/0028. Set a bit past 24h so `activityFor`'s in-app cutoff filter
 * (below) never has to worry about a not-yet-expired stale straggler. */
const TTL_MS = 25 * 60 * 60 * 1000;

/**
 * Owns `apiCallLog` — one doc per authenticated request, written
 * fire-and-forget by callLogging.ts. Feeds the admin dashboard's recent-
 * activity table (listRecent) and each account's usage summary (activityFor).
 */
export interface ApiCallLogStore {
  logCall(entry: Omit<ApiCallLogEntry, 'id' | 'ts'>): Promise<void>;
  listRecent(limit: number): Promise<ApiCallLogEntry[]>;
  /** Computed from entries within the last 24h for this uid — see the module
   * doc comment on why this filters in application code rather than a
   * Firestore range query. */
  activityFor(uid: string): Promise<AccountActivity>;
}

const LOG_COLLECTION = 'apiCallLog';

function computeActivity(entries: ApiCallLogEntry[]): AccountActivity {
  const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
  const recent = entries.filter((e) => new Date(e.ts).getTime() >= cutoff);
  if (recent.length === 0) return { callCount24h: 0, lastCallAt: null, lastEndpoint: null };
  const latest = recent.reduce((a, b) => (a.ts > b.ts ? a : b));
  return { callCount24h: recent.length, lastCallAt: latest.ts, lastEndpoint: `${latest.method} ${latest.path}` };
}

export function createFirestoreApiCallLogStore(firestore: Firestore): ApiCallLogStore {
  const collection = firestore.collection(LOG_COLLECTION);

  return {
    async logCall(entry) {
      const now = new Date();
      const doc: ApiCallLogEntry & { expiresAt: Date } = {
        id: randomUUID(),
        ...entry,
        ts: now.toISOString(),
        expiresAt: new Date(now.getTime() + TTL_MS),
      };
      await collection.doc(doc.id).set(doc);
    },

    async listRecent(limit) {
      const snapshot = await collection.orderBy('ts', 'desc').limit(limit).get();
      return snapshot.docs.map((d) => d.data() as ApiCallLogEntry);
    },

    async activityFor(uid) {
      // Single equality filter only (no composite index needed) — the 24h
      // cutoff is applied in-app, not as a Firestore range clause. TTL keeps
      // this collection's per-uid size bounded to roughly a day of traffic.
      const snapshot = await collection.where('uid', '==', uid).get();
      return computeActivity(snapshot.docs.map((d) => d.data() as ApiCallLogEntry));
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryApiCallLogStore(): ApiCallLogStore {
  const entries: ApiCallLogEntry[] = [];

  return {
    async logCall(entry) {
      entries.push({ id: randomUUID(), ...entry, ts: new Date().toISOString() });
    },

    async listRecent(limit) {
      return [...entries].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
    },

    async activityFor(uid) {
      return computeActivity(entries.filter((e) => e.uid === uid));
    },
  };
}
