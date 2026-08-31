import { describe, it, expect } from 'vitest';
import { createInMemoryChatSessionStore } from './chatSessionStore.js';

describe('createInMemoryChatSessionStore', () => {
  it('createSession assigns incrementing sessionNumber per project, starting at 1', async () => {
    const store = createInMemoryChatSessionStore();
    const s1 = await store.createSession({ projectId: 'proj-a' });
    const s2 = await store.createSession({ projectId: 'proj-a' });
    const otherProject = await store.createSession({ projectId: 'proj-b' });
    expect(s1.sessionNumber).toBe(1);
    expect(s2.sessionNumber).toBe(2);
    expect(otherProject.sessionNumber).toBe(1);
    expect(s1.status).toBe('idle');
    expect(s1.turns).toEqual([]);
  });

  it('listSessions scopes per project, ordered by sessionNumber', async () => {
    const store = createInMemoryChatSessionStore();
    await store.createSession({ projectId: 'proj-a', name: 'First' });
    await store.createSession({ projectId: 'proj-a', name: 'Second' });
    const listed = await store.listSessions('proj-a');
    expect(listed.map((s) => s.name)).toEqual(['First', 'Second']);
  });

  it('updateSession patches turns/status, scoped per project', async () => {
    const store = createInMemoryChatSessionStore();
    const session = await store.createSession({ projectId: 'proj-a' });
    const turn = { role: 'user' as const, parts: [{ text: 'hi' }], ts: new Date().toISOString() };
    const updated = await store.updateSession('proj-a', session.id, { status: 'streaming', turns: [turn] });
    expect(updated?.status).toBe('streaming');
    expect(updated?.turns).toEqual([turn]);
    expect(await store.updateSession('proj-b', session.id, { status: 'error' })).toBeUndefined();
  });

  it('getSession returns undefined for a session under the wrong project', async () => {
    const store = createInMemoryChatSessionStore();
    const session = await store.createSession({ projectId: 'proj-a' });
    expect(await store.getSession('proj-a', session.id)).toEqual(session);
    expect(await store.getSession('proj-b', session.id)).toBeUndefined();
  });
});
