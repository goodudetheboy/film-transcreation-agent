import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { DiscoveryAgentSession, DiscoveryChatSessionStatus, DiscoveryChatTurn } from './filmTypes.js';

export type { DiscoveryAgentSession, DiscoveryChatSessionStatus, DiscoveryChatTurn, DiscoveryChatPart } from './filmTypes.js';

export interface CreateDiscoveryChatSessionInput {
  filmId: string;
  name?: string | null;
}

/**
 * Owns `films/{filmId}/discoveryAgents/{agentId}` — turns embedded in-doc,
 * same shape as chatSessionStore.ts's projects/{id}/chatSessions. Each
 * session IS "Agent #N" in the UI (agentNumber, not sessionNumber, to line
 * up with DiscoveryJob's field of the same name) — every pass kicked off
 * from this thread is filed under the same number.
 */
export interface DiscoveryChatSessionStore {
  createSession(input: CreateDiscoveryChatSessionInput): Promise<DiscoveryAgentSession>;
  getSession(filmId: string, agentId: string): Promise<DiscoveryAgentSession | undefined>;
  listSessions(filmId: string): Promise<DiscoveryAgentSession[]>;
  updateSession(
    filmId: string,
    agentId: string,
    patch: Partial<Pick<DiscoveryAgentSession, 'name' | 'status' | 'turns' | 'errorMessage'>>,
  ): Promise<DiscoveryAgentSession | undefined>;
}

function sessionsCollection(firestore: Firestore, filmId: string) {
  return firestore.collection('films').doc(filmId).collection('discoveryAgents');
}

function newSession(id: string, input: CreateDiscoveryChatSessionInput, agentNumber: number, now: string): DiscoveryAgentSession {
  return {
    id,
    filmId: input.filmId,
    name: input.name ?? null,
    agentNumber,
    status: 'idle' as DiscoveryChatSessionStatus,
    turns: [] as DiscoveryChatTurn[],
    createdAt: now,
    updatedAt: now,
  };
}

export function createFirestoreDiscoveryChatSessionStore(firestore: Firestore): DiscoveryChatSessionStore {
  return {
    async createSession(input) {
      const existing = (await sessionsCollection(firestore, input.filmId).get()).docs.map(
        (d) => d.data() as DiscoveryAgentSession,
      );
      const nextNumber = (existing.length ? Math.max(...existing.map((s) => s.agentNumber)) : 0) + 1;
      const session = newSession(randomUUID(), input, nextNumber, new Date().toISOString());
      await sessionsCollection(firestore, input.filmId).doc(session.id).set(session);
      return session;
    },

    async getSession(filmId, agentId) {
      const doc = await sessionsCollection(firestore, filmId).doc(agentId).get();
      return doc.exists ? (doc.data() as DiscoveryAgentSession) : undefined;
    },

    async listSessions(filmId) {
      const snapshot = await sessionsCollection(firestore, filmId).orderBy('agentNumber', 'asc').get();
      return snapshot.docs.map((d) => d.data() as DiscoveryAgentSession);
    },

    async updateSession(filmId, agentId, patch) {
      const ref = sessionsCollection(firestore, filmId).doc(agentId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: DiscoveryAgentSession = { ...(doc.data() as DiscoveryAgentSession), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryDiscoveryChatSessionStore(): DiscoveryChatSessionStore {
  const sessions = new Map<string, DiscoveryAgentSession>(); // agentId -> session

  return {
    async createSession(input) {
      const existing = [...sessions.values()].filter((s) => s.filmId === input.filmId);
      const nextNumber = (existing.length ? Math.max(...existing.map((s) => s.agentNumber)) : 0) + 1;
      const session = newSession(randomUUID(), input, nextNumber, new Date().toISOString());
      sessions.set(session.id, session);
      return session;
    },

    async getSession(filmId, agentId) {
      const session = sessions.get(agentId);
      return session && session.filmId === filmId ? session : undefined;
    },

    async listSessions(filmId) {
      return [...sessions.values()]
        .filter((s) => s.filmId === filmId)
        .sort((a, b) => a.agentNumber - b.agentNumber);
    },

    async updateSession(filmId, agentId, patch) {
      const current = sessions.get(agentId);
      if (!current || current.filmId !== filmId) return undefined;
      const updated: DiscoveryAgentSession = { ...current, ...patch, updatedAt: new Date().toISOString() };
      sessions.set(agentId, updated);
      return updated;
    },
  };
}
