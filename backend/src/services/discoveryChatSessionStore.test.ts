import { describe, it, expect } from 'vitest';
import { createInMemoryDiscoveryChatSessionStore } from './discoveryChatSessionStore.js';

describe('createInMemoryDiscoveryChatSessionStore', () => {
  it('createSession assigns incrementing agentNumber per film, starting at 1', async () => {
    const store = createInMemoryDiscoveryChatSessionStore();
    const s1 = await store.createSession({ filmId: 'film-a' });
    const s2 = await store.createSession({ filmId: 'film-a' });
    const otherFilm = await store.createSession({ filmId: 'film-b' });
    expect(s1.agentNumber).toBe(1);
    expect(s2.agentNumber).toBe(2);
    expect(otherFilm.agentNumber).toBe(1);
    expect(s1.status).toBe('idle');
    expect(s1.turns).toEqual([]);
  });

  it('listSessions scopes per film, ordered by agentNumber', async () => {
    const store = createInMemoryDiscoveryChatSessionStore();
    await store.createSession({ filmId: 'film-a', name: 'First' });
    await store.createSession({ filmId: 'film-a', name: 'Second' });
    const listed = await store.listSessions('film-a');
    expect(listed.map((s) => s.name)).toEqual(['First', 'Second']);
  });

  it('updateSession patches turns/status, scoped per film', async () => {
    const store = createInMemoryDiscoveryChatSessionStore();
    const session = await store.createSession({ filmId: 'film-a' });
    const turn = { role: 'user' as const, parts: [{ text: 'hi' }], ts: new Date().toISOString() };
    const updated = await store.updateSession('film-a', session.id, { status: 'streaming', turns: [turn] });
    expect(updated?.status).toBe('streaming');
    expect(updated?.turns).toEqual([turn]);
    expect(await store.updateSession('film-b', session.id, { status: 'error' })).toBeUndefined();
  });

  it('getSession returns undefined for a session under the wrong film', async () => {
    const store = createInMemoryDiscoveryChatSessionStore();
    const session = await store.createSession({ filmId: 'film-a' });
    expect(await store.getSession('film-a', session.id)).toEqual(session);
    expect(await store.getSession('film-b', session.id)).toBeUndefined();
  });
});
