import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryFilmStore } from '../services/filmStore.js';
import { createInMemoryDetailRowsStore } from '../services/detailRowsStore.js';
import { createInMemoryDiscoveryJobStore } from '../services/discoveryJobStore.js';

const TEST_PASSCODE = 'test-passcode';

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

async function seedAppAndFilm() {
  const filmStore = createInMemoryFilmStore();
  const detailRowsStore = createInMemoryDetailRowsStore();
  const discoveryJobStore = createInMemoryDiscoveryJobStore();
  const film = await filmStore.createFilm({ title: 'Inside Out', videoUrl: 'http://example.com/v.mp4', subtitle: null, runDiscoveryOnCreate: false });
  const app = createApp({
    config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
    filmStore,
    detailRowsStore,
    discoveryJobStore,
  });
  return { app, film, filmStore, detailRowsStore, discoveryJobStore };
}

describe('POST /api/films/:id/discovery-agents and GET variants', () => {
  it('creates, lists, and fetches a discovery agent session', async () => {
    const { app, film } = await seedAppAndFilm();
    const created = await request(app).post(`/api/films/${film.id}/discovery-agents`).send({ passcode: TEST_PASSCODE, name: 'Agent A' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Agent A', agentNumber: 1, status: 'idle', turns: [] });

    const list = await request(app).get(`/api/films/${film.id}/discovery-agents?passcode=${TEST_PASSCODE}`);
    expect(list.body).toHaveLength(1);

    const fetched = await request(app).get(`/api/films/${film.id}/discovery-agents/${created.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('returns 404 for an unknown film on create, and an unknown agent on fetch', async () => {
    const { app, film } = await seedAppAndFilm();
    expect((await request(app).post('/api/films/does-not-exist/discovery-agents').send({ passcode: TEST_PASSCODE })).status).toBe(404);
    expect((await request(app).get(`/api/films/${film.id}/discovery-agents/does-not-exist?passcode=${TEST_PASSCODE}`)).status).toBe(404);
  });
});

describe('POST /api/films/:id/discovery-agents/:agentId/runs', () => {
  it('files a run marker turn for a job that belongs to this agent', async () => {
    const { app, film, discoveryJobStore } = await seedAppAndFilm();
    const session = await request(app).post(`/api/films/${film.id}/discovery-agents`).send({ passcode: TEST_PASSCODE });
    const job = await discoveryJobStore.createJob({
      filmId: film.id,
      agentNumber: session.body.agentNumber,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      testMode: true,
    });

    const res = await request(app)
      .post(`/api/films/${film.id}/discovery-agents/${session.body.id}/runs`)
      .send({ passcode: TEST_PASSCODE, jobId: job.id });

    expect(res.status).toBe(200);
    expect(res.body.turns).toEqual([{ role: 'system', parts: [{ run: { jobId: job.id } }], ts: expect.any(String) }]);
  });

  it('rejects a job that belongs to a different agent', async () => {
    const { app, film, discoveryJobStore } = await seedAppAndFilm();
    const session = await request(app).post(`/api/films/${film.id}/discovery-agents`).send({ passcode: TEST_PASSCODE });
    const otherAgentJob = await discoveryJobStore.createJob({
      filmId: film.id,
      agentNumber: 999,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      testMode: true,
    });

    const res = await request(app)
      .post(`/api/films/${film.id}/discovery-agents/${session.body.id}/runs`)
      .send({ passcode: TEST_PASSCODE, jobId: otherAgentJob.id });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/films/:id/discovery-agents/:agentId/messages', () => {
  it('streams a tool-calling turn from the mock agent by default (testMode), and a row edit reflects a real store write', async () => {
    const { app, film, detailRowsStore } = await seedAppAndFilm();
    await detailRowsStore.addRow(film.id, {
      startMs: 0,
      endMs: 1000,
      subtitleText: 'hello there',
      values: { segmentDescription: 'a scene' },
      provenance: { type: 'user-marked' },
    });
    const session = await request(app).post(`/api/films/${film.id}/discovery-agents`).send({ passcode: TEST_PASSCODE });

    const res = await request(app)
      .post(`/api/films/${film.id}/discovery-agents/${session.body.id}/messages`)
      .send({ passcode: TEST_PASSCODE, text: 'anything to flag?' });

    const events = parseEvents(res.text);
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'turn_done' });

    const fetchedSession = await request(app).get(`/api/films/${film.id}/discovery-agents/${session.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetchedSession.body.status).toBe('idle');
    expect(fetchedSession.body.turns.length).toBeGreaterThan(0);

    const rows = await request(app).get(`/api/films/${film.id}/details?passcode=${TEST_PASSCODE}`);
    expect(rows.body.rows[0].values.notes).not.toBe('');
  });

  it('returns 400 when text is missing, and 404 for an unknown agent', async () => {
    const { app, film } = await seedAppAndFilm();
    const session = await request(app).post(`/api/films/${film.id}/discovery-agents`).send({ passcode: TEST_PASSCODE });

    expect(
      (await request(app).post(`/api/films/${film.id}/discovery-agents/${session.body.id}/messages`).send({ passcode: TEST_PASSCODE })).status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/films/${film.id}/discovery-agents/does-not-exist/messages`).send({ passcode: TEST_PASSCODE, text: 'hi' }))
        .status,
    ).toBe(404);
  });

  it('the real (non-test-mode) agent path fails cleanly when discoveryChatAgent was not configured', async () => {
    const { app, film } = await seedAppAndFilm();
    const session = await request(app).post(`/api/films/${film.id}/discovery-agents`).send({ passcode: TEST_PASSCODE });

    const res = await request(app)
      .post(`/api/films/${film.id}/discovery-agents/${session.body.id}/messages`)
      .send({ passcode: TEST_PASSCODE, text: 'hi', testMode: false });

    const events = parseEvents(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('not provided') });
  });
});
