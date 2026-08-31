import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryFilmStore } from '../services/filmStore.js';
import { createInMemoryDetailRowsStore } from '../services/detailRowsStore.js';

const TEST_PASSCODE = 'test-passcode';

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

async function seedAppAndProject() {
  const filmStore = createInMemoryFilmStore();
  const detailRowsStore = createInMemoryDetailRowsStore();
  const film = await filmStore.createFilm({ title: 'Inside Out', videoUrl: 'http://example.com/v.mp4', subtitle: null, runDiscoveryOnCreate: false });
  const row = await detailRowsStore.addRow(film.id, {
    startMs: 0,
    endMs: 1000,
    subtitleText: 'hello',
    values: { segmentDescription: 'scene' },
    provenance: { type: 'user-marked' },
  });
  const app = createApp({ config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 }, filmStore, detailRowsStore });
  const created = await request(app)
    .post(`/api/films/${film.id}/projects`)
    .send({ passcode: TEST_PASSCODE, country: 'Japan', detailRowIds: [row.id] });
  return { app, project: created.body.project as { id: string }, items: created.body.items as Array<{ id: string }> };
}

describe('POST /api/projects/:id/chat-sessions and GET variants', () => {
  it('creates, lists, and fetches a chat session', async () => {
    const { app, project } = await seedAppAndProject();
    const created = await request(app).post(`/api/projects/${project.id}/chat-sessions`).send({ passcode: TEST_PASSCODE, name: 'Session A' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Session A', sessionNumber: 1, status: 'idle', turns: [] });

    const list = await request(app).get(`/api/projects/${project.id}/chat-sessions?passcode=${TEST_PASSCODE}`);
    expect(list.body).toHaveLength(1);

    const fetched = await request(app).get(`/api/projects/${project.id}/chat-sessions/${created.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('returns 404 for an unknown project on create, and an unknown session on fetch', async () => {
    const { app, project } = await seedAppAndProject();
    expect((await request(app).post('/api/projects/does-not-exist/chat-sessions').send({ passcode: TEST_PASSCODE })).status).toBe(404);
    expect((await request(app).get(`/api/projects/${project.id}/chat-sessions/does-not-exist?passcode=${TEST_PASSCODE}`)).status).toBe(404);
  });
});

describe('POST /api/projects/:id/chat-sessions/:sessionId/messages', () => {
  it('streams a tool-calling turn from the mock agent by default (testMode), and item_patched reflects a real store write', async () => {
    const { app, project, items } = await seedAppAndProject();
    const session = await request(app).post(`/api/projects/${project.id}/chat-sessions`).send({ passcode: TEST_PASSCODE });

    const res = await request(app)
      .post(`/api/projects/${project.id}/chat-sessions/${session.body.id}/messages`)
      .send({ passcode: TEST_PASSCODE, text: 'what do you think of this line?', itemId: items[0].id });

    const events = parseEvents(res.text);
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'turn_done' });

    const fetchedSession = await request(app).get(`/api/projects/${project.id}/chat-sessions/${session.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetchedSession.body.status).toBe('idle');
    expect(fetchedSession.body.turns.length).toBeGreaterThan(0);

    const fetchedItem = await request(app).get(`/api/projects/${project.id}/items?passcode=${TEST_PASSCODE}`);
    const patchedItem = fetchedItem.body.find((i: { id: string }) => i.id === items[0].id);
    // The mock chat agent's canned tool call only fires when a rubric exists — this
    // project was created with the DEFAULT_RUBRICS fallback, so at least one does.
    expect(patchedItem.scores.length).toBeGreaterThan(0);
  });

  it('returns 400 when text is missing, and 404 for an unknown session', async () => {
    const { app, project } = await seedAppAndProject();
    const session = await request(app).post(`/api/projects/${project.id}/chat-sessions`).send({ passcode: TEST_PASSCODE });

    expect(
      (await request(app).post(`/api/projects/${project.id}/chat-sessions/${session.body.id}/messages`).send({ passcode: TEST_PASSCODE })).status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/projects/${project.id}/chat-sessions/does-not-exist/messages`).send({ passcode: TEST_PASSCODE, text: 'hi' }))
        .status,
    ).toBe(404);
  });

  it('the real (non-test-mode) agent path fails cleanly when researchChatAgent was not configured', async () => {
    const { app, project, items } = await seedAppAndProject();
    const session = await request(app).post(`/api/projects/${project.id}/chat-sessions`).send({ passcode: TEST_PASSCODE });

    const res = await request(app)
      .post(`/api/projects/${project.id}/chat-sessions/${session.body.id}/messages`)
      .send({ passcode: TEST_PASSCODE, text: 'hi', testMode: false, itemId: items[0].id });

    const events = parseEvents(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('not provided') });
  });
});
