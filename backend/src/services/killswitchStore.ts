import type { Firestore } from '@google-cloud/firestore';

export interface KillswitchState {
  enabled: boolean;
  reason: string | null;
  setBy: string | null;
  setAt: string | null;
}

const DEFAULT_STATE: KillswitchState = { enabled: false, reason: null, setBy: null, setAt: null };

/**
 * Owns the single `systemConfig/killswitch` doc (see docs/adr/0028). Read
 * once per request by killswitch.ts's middleware — deliberately a plain
 * Firestore read rather than a cached onSnapshot listener, to avoid listener
 * lifecycle/cold-start complexity; propagation is then "as fast as the next
 * request", which is fast enough for this app's actual risk model (uncontrolled
 * GCP cost, same as ADR-0008 — not a hard real-time guarantee).
 */
export interface KillswitchStore {
  get(): Promise<KillswitchState>;
  set(state: Omit<KillswitchState, 'setAt'>): Promise<KillswitchState>;
}

function killswitchDoc(firestore: Firestore) {
  return firestore.collection('systemConfig').doc('killswitch');
}

export function createFirestoreKillswitchStore(firestore: Firestore): KillswitchStore {
  const ref = killswitchDoc(firestore);

  return {
    async get() {
      const doc = await ref.get();
      return doc.exists ? (doc.data() as KillswitchState) : DEFAULT_STATE;
    },

    async set(state) {
      const updated: KillswitchState = { ...state, setAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryKillswitchStore(initial: KillswitchState = DEFAULT_STATE): KillswitchStore {
  let state = initial;

  return {
    async get() {
      return state;
    },
    async set(next) {
      state = { ...next, setAt: new Date().toISOString() };
      return state;
    },
  };
}
