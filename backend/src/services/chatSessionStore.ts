import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { ChatSession, ChatSessionStatus, ChatTurn } from './projectTypes.js';

export type { ChatSession, ChatSessionStatus, ChatTurn, ChatPart } from './projectTypes.js';

export interface CreateChatSessionInput {
  projectId: string;
  name?: string | null;
}

/**
 * Owns `projects/{projectId}/chatSessions/{sessionId}` — turns embedded
 * in-doc, same as DiscoveryJob embeds conversationHistory. Multiple swappable
 * sessions per project (per the user's confirmed "Claude Code edit mode"
 * requirement), each independently numbered so the UI can label them
 * "Session 1", "Session 2", ... without a client-side counter.
 */
export interface ChatSessionStore {
  createSession(input: CreateChatSessionInput): Promise<ChatSession>;
  getSession(projectId: string, sessionId: string): Promise<ChatSession | undefined>;
  listSessions(projectId: string): Promise<ChatSession[]>;
  updateSession(
    projectId: string,
    sessionId: string,
    patch: Partial<Pick<ChatSession, 'name' | 'status' | 'turns' | 'errorMessage'>>,
  ): Promise<ChatSession | undefined>;
}

function sessionsCollection(firestore: Firestore, projectId: string) {
  return firestore.collection('projects').doc(projectId).collection('chatSessions');
}

function newSession(id: string, input: CreateChatSessionInput, sessionNumber: number, now: string): ChatSession {
  return {
    id,
    projectId: input.projectId,
    name: input.name ?? null,
    sessionNumber,
    status: 'idle' as ChatSessionStatus,
    turns: [] as ChatTurn[],
    createdAt: now,
    updatedAt: now,
  };
}

export function createFirestoreChatSessionStore(firestore: Firestore): ChatSessionStore {
  return {
    async createSession(input) {
      const existing = (await sessionsCollection(firestore, input.projectId).get()).docs.map(
        (d) => d.data() as ChatSession,
      );
      const nextNumber = (existing.length ? Math.max(...existing.map((s) => s.sessionNumber)) : 0) + 1;
      const session = newSession(randomUUID(), input, nextNumber, new Date().toISOString());
      await sessionsCollection(firestore, input.projectId).doc(session.id).set(session);
      return session;
    },

    async getSession(projectId, sessionId) {
      const doc = await sessionsCollection(firestore, projectId).doc(sessionId).get();
      return doc.exists ? (doc.data() as ChatSession) : undefined;
    },

    async listSessions(projectId) {
      const snapshot = await sessionsCollection(firestore, projectId).orderBy('sessionNumber', 'asc').get();
      return snapshot.docs.map((d) => d.data() as ChatSession);
    },

    async updateSession(projectId, sessionId, patch) {
      const ref = sessionsCollection(firestore, projectId).doc(sessionId);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: ChatSession = { ...(doc.data() as ChatSession), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },
  };
}

/** In-memory fake, same interface/semantics — for unit tests. */
export function createInMemoryChatSessionStore(): ChatSessionStore {
  const sessions = new Map<string, ChatSession>(); // sessionId -> session

  return {
    async createSession(input) {
      const existing = [...sessions.values()].filter((s) => s.projectId === input.projectId);
      const nextNumber = (existing.length ? Math.max(...existing.map((s) => s.sessionNumber)) : 0) + 1;
      const session = newSession(randomUUID(), input, nextNumber, new Date().toISOString());
      sessions.set(session.id, session);
      return session;
    },

    async getSession(projectId, sessionId) {
      const session = sessions.get(sessionId);
      return session && session.projectId === projectId ? session : undefined;
    },

    async listSessions(projectId) {
      return [...sessions.values()]
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.sessionNumber - b.sessionNumber);
    },

    async updateSession(projectId, sessionId, patch) {
      const current = sessions.get(sessionId);
      if (!current || current.projectId !== projectId) return undefined;
      const updated: ChatSession = { ...current, ...patch, updatedAt: new Date().toISOString() };
      sessions.set(sessionId, updated);
      return updated;
    },
  };
}
