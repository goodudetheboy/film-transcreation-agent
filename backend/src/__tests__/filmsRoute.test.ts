import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createFilmStore } from '../services/filmStore.js';
import type { FixtureDetail } from '../fixtures/insideOutDetails.js';

const TEST_PASSCODE = 'test-passcode';
const FIXTURE: FixtureDetail[] = [
  { scriptLine: 'a', sceneDescription: 'b' },
  { scriptLine: '', sceneDescription: 'c' },
];

function buildApp(overrides: { seedFilms?: Parameters<typeof createFilmStore>[1] } = {}) {
  return createApp({
    config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
    dialogflowClient: { analyzeScript: vi.fn() },
    filmStore: createFilmStore(FIXTURE, overrides.seedFilms ?? []),
  });
}

describe('POST /api/films', () => {
  it('creates a film, already mock-processed with details', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'New Film', script: 'a script', videoUrl: 'https://example.com/v.mp4' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe('processed');
    expect(res.body.details).toHaveLength(2);
  });

  it('returns 400 when title, script, or videoUrl is missing', async () => {
    const app = buildApp();
    const missingTitle = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, script: 'x', videoUrl: 'https://example.com/v.mp4' });
    expect(missingTitle.status).toBe(400);

    const missingScript = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'X', videoUrl: 'https://example.com/v.mp4' });
    expect(missingScript.status).toBe(400);

    const missingUrl = await request(app)
      .post('/api/films')
      .send({ passcode: TEST_PASSCODE, title: 'X', script: 'x' });
    expect(missingUrl.status).toBe(400);
  });
});

describe('GET /api/films and /api/films/:id', () => {
  it('lists seeded films and fetches one by id', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });

    const list = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Inside Out');

    const fetched = await request(app).get(`/api/films/${list.body[0].id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.title).toBe('Inside Out');
  });

  it('returns 404 for an unknown film id', async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/films/does-not-exist?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/films/:id/create-project', () => {
  it('creates a project from the film\'s details, scoped to the given country', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app)
      .post(`/api/films/${filmId}/create-project`)
      .send({ passcode: TEST_PASSCODE, country: 'Japan' });

    expect(res.status).toBe(201);
    expect(res.body.country).toBe('Japan');
    expect(res.body.status).toBe('draft');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].sceneDescription).toBe('b');
    expect(res.body.rubrics.length).toBeGreaterThan(0);
  });

  it('returns 404 when the film does not exist', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/films/does-not-exist/create-project')
      .send({ passcode: TEST_PASSCODE, country: 'Japan' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when country is missing', async () => {
    const app = buildApp({
      seedFilms: [{ title: 'Inside Out', script: 'placeholder', videoUrl: 'https://example.com/io.mp4' }],
    });
    const films = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    const filmId = films.body[0].id;

    const res = await request(app).post(`/api/films/${filmId}/create-project`).send({ passcode: TEST_PASSCODE });
    expect(res.status).toBe(400);
  });
});
