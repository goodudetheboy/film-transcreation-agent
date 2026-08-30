import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryFilmStore } from '../services/filmStore.js';
import { createInMemoryDetailRowsStore } from '../services/detailRowsStore.js';
import { createInMemoryDiscoveryJobStore } from '../services/discoveryJobStore.js';
import { createFilmPrepPipeline } from '../services/filmPrepPipeline.js';
import { createDiscoveryEventBus } from '../services/discoveryEventBus.js';
import type { DiscoveryAgent } from '../services/discoveryAgent.js';
import type { CreateFilmInput } from '../services/filmTypes.js';

const TEST_PASSCODE = 'test-passcode';

const SUBTITLE_ENTRIES = [{ id: 'e1', index: 0, startMs: 0, endMs: 2000, text: 'Hello there' }];

function noResultsAgent(): DiscoveryAgent {
  return { runPass: vi.fn().mockResolvedValue({ resultRows: [], updatedConversation: [] }) };
}

function buildApp(
  overrides: {
    seedFilms?: CreateFilmInput[];
    videoBucketUploader?: { uploadFromUrl: ReturnType<typeof vi.fn>; uploadBuffer: ReturnType<typeof vi.fn> };
    maxVideoUploadBytes?: number;
    maxSubtitleUploadBytes?: number;
    mockUploadsDir?: string;
    discoveryAgent?: DiscoveryAgent;
    mockDiscoveryAgent?: DiscoveryAgent;
  } = {},
) {
  const filmStore = createInMemoryFilmStore(overrides.seedFilms ?? []);
  const detailRowsStore = createInMemoryDetailRowsStore();
  const discoveryJobStore = createInMemoryDiscoveryJobStore();
  const eventBus = createDiscoveryEventBus();
  const discoveryAgent = overrides.discoveryAgent ?? noResultsAgent();
  const mockDiscoveryAgent = overrides.mockDiscoveryAgent ?? noResultsAgent();

  const app = createApp({
    config: {
      sharedPasscode: TEST_PASSCODE,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
      mockDelayScale: 0.001,
      ...(overrides.maxVideoUploadBytes !== undefined ? { maxVideoUploadBytes: overrides.maxVideoUploadBytes } : {}),
      ...(overrides.maxSubtitleUploadBytes !== undefined ? { maxSubtitleUploadBytes: overrides.maxSubtitleUploadBytes } : {}),
      ...(overrides.mockUploadsDir !== undefined ? { mockUploadsDir: overrides.mockUploadsDir } : {}),
    },
    filmStore,
    detailRowsStore,
    discoveryJobStore,
    eventBus,
    discoveryAgent,
    mockDiscoveryAgent,
    videoBucketUploader: overrides.videoBucketUploader ?? { uploadFromUrl: vi.fn(), uploadBuffer: vi.fn() },
  });

  return { app, filmStore, detailRowsStore, discoveryJobStore };
}

async function createFilm(app: ReturnType<typeof buildApp>['app'], overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/films')
    .send({
      passcode: TEST_PASSCODE,
      title: 'New Film',
      videoUrl: 'gs://bucket/v.mp4',
      subtitleUrl: 'gs://bucket/subtitles/x.srt',
      subtitleFormat: 'srt',
      subtitleEntries: SUBTITLE_ENTRIES,
      testMode: true,
      ...overrides,
    });
}

describe('POST /api/films', () => {
  it('creates a film with the uploaded video/subtitle, kicking off the prep pipeline', async () => {
    const { app } = buildApp();
    const res = await createFilm(app);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.subtitle.entries).toEqual(SUBTITLE_ENTRIES);
    expect(res.body.prep.stage).toBe('finalizing');
  });

  it('requires title, videoUrl, subtitleUrl/Format/Entries', async () => {
    const { app } = buildApp();
    const missingTitle = await createFilm(app, { title: undefined });
    expect(missingTitle.status).toBe(400);

    const missingSubtitle = await createFilm(app, { subtitleUrl: undefined });
    expect(missingSubtitle.status).toBe(400);

    const badFormat = await createFilm(app, { subtitleFormat: 'ass' });
    expect(badFormat.status).toBe(400);

    const emptyEntries = await createFilm(app, { subtitleEntries: [] });
    expect(emptyEntries.status).toBe(400);
  });

  it('eventually reaches prep.stage "ready" once the pipeline finishes (polled via prep-status)', async () => {
    const { app } = buildApp();
    const created = await createFilm(app, { runDiscovery: false });
    const filmId = created.body.id;

    // Terminal prep-status resolves in one buffered response once the film is ready.
    let stage = created.body.prep.stage;
    for (let i = 0; i < 20 && stage !== 'ready'; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const fetched = await request(app).get(`/api/films/${filmId}?passcode=${TEST_PASSCODE}`);
      stage = fetched.body.prep.stage;
    }
    expect(stage).toBe('ready');
  });
});

describe('POST /api/films/upload-subtitle', () => {
  it('parses a valid .srt file and returns entries without touching the bucket in test mode', async () => {
    const uploadBuffer = vi.fn();
    const { app } = buildApp({ videoBucketUploader: { uploadFromUrl: vi.fn(), uploadBuffer } });

    const res = await request(app)
      .post(`/api/films/upload-subtitle?passcode=${TEST_PASSCODE}`)
      .field('testMode', 'true')
      .attach(
        'subtitle',
        Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello there.\n'),
        { filename: 'clip.srt', contentType: 'text/plain' },
      );

    expect(res.status).toBe(200);
    expect(res.body.format).toBe('srt');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.subtitleUrl).toMatch(/^gs:\/\//);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects a file that is not .srt or .vtt', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post(`/api/films/upload-subtitle?passcode=${TEST_PASSCODE}`)
      .attach('subtitle', Buffer.from('hi'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('rejects a file with no parseable cues', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post(`/api/films/upload-subtitle?passcode=${TEST_PASSCODE}`)
      .attach('subtitle', Buffer.from('not a subtitle file'), { filename: 'clip.srt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

describe('GET/DELETE /api/films', () => {
  it('lists and fetches a seeded film, then deletes it', async () => {
    const { app } = buildApp({
      seedFilms: [{ title: 'Seeded', videoUrl: 'gs://bucket/v.mp4', subtitle: { fileUrl: 'gs://bucket/x.srt', format: 'srt', entries: SUBTITLE_ENTRIES }, runDiscoveryOnCreate: false }],
    });

    const list = await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`);
    expect(list.body).toHaveLength(1);
    const filmId = list.body[0].id;

    const fetched = await request(app).get(`/api/films/${filmId}?passcode=${TEST_PASSCODE}`);
    expect(fetched.body.title).toBe('Seeded');

    const del = await request(app).delete(`/api/films/${filmId}?passcode=${TEST_PASSCODE}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/films?passcode=${TEST_PASSCODE}`)).body).toHaveLength(0);
  });

  it('returns 404 for an unknown film id on get/delete', async () => {
    const { app } = buildApp();
    expect((await request(app).get(`/api/films/nope?passcode=${TEST_PASSCODE}`)).status).toBe(404);
    expect((await request(app).delete(`/api/films/nope?passcode=${TEST_PASSCODE}`)).status).toBe(404);
  });
});

describe('Details table routes', () => {
  async function seedFilmId(app: ReturnType<typeof buildApp>['app']) {
    const res = await createFilm(app, { runDiscovery: false });
    return res.body.id as string;
  }

  it('adds, lists, updates, and deletes a manual detail row with a freeform start/end range', async () => {
    const { app } = buildApp();
    const filmId = await seedFilmId(app);

    const add = await request(app)
      .post(`/api/films/${filmId}/details`)
      .send({ passcode: TEST_PASSCODE, startMs: 0, endMs: 2000, values: { notes: 'check this' } });
    expect(add.status).toBe(201);
    expect(add.body.provenance).toEqual({ type: 'user-marked' });
    expect(add.body.subtitleText).toBe('Hello there');
    const rowId = add.body.id;

    const list = await request(app).get(`/api/films/${filmId}/details?passcode=${TEST_PASSCODE}`);
    expect(list.body.rows).toHaveLength(1);

    const patch = await request(app)
      .patch(`/api/films/${filmId}/details/${rowId}`)
      .send({ passcode: TEST_PASSCODE, values: { gesture: 'nod' } });
    expect(patch.body.values).toMatchObject({ notes: 'check this', gesture: 'nod' });

    const del = await request(app).delete(`/api/films/${filmId}/details/${rowId}?passcode=${TEST_PASSCODE}`);
    expect(del.status).toBe(204);
  });

  it('rejects endMs <= startMs', async () => {
    const { app } = buildApp();
    const filmId = await seedFilmId(app);
    const res = await request(app)
      .post(`/api/films/${filmId}/details`)
      .send({ passcode: TEST_PASSCODE, startMs: 2000, endMs: 2000, values: {} });
    expect(res.status).toBe(400);
  });

  it('derives empty subtitle text for a range with no dialogue in it (a non-dialogue moment)', async () => {
    const { app } = buildApp();
    const filmId = await seedFilmId(app);
    const add = await request(app)
      .post(`/api/films/${filmId}/details`)
      .send({ passcode: TEST_PASSCODE, startMs: 10_000, endMs: 12_000, values: {} });
    expect(add.status).toBe(201);
    expect(add.body.subtitleText).toBe('');
  });

  it('derives joined subtitle text for a range spanning two adjacent subtitle entries', async () => {
    const { app } = buildApp();
    const created = await createFilm(app, {
      runDiscovery: false,
      subtitleEntries: [
        { id: 'e1', index: 0, startMs: 0, endMs: 2000, text: 'Hello there' },
        { id: 'e2', index: 1, startMs: 2000, endMs: 4000, text: 'General Kenobi' },
      ],
    });
    const filmId = created.body.id;
    const add = await request(app)
      .post(`/api/films/${filmId}/details`)
      .send({ passcode: TEST_PASSCODE, startMs: 0, endMs: 4000, values: {} });
    expect(add.status).toBe(201);
    expect(add.body.subtitleText).toBe('Hello there General Kenobi');
  });

  it('adds a custom column', async () => {
    const { app } = buildApp();
    const filmId = await seedFilmId(app);
    const res = await request(app).post(`/api/films/${filmId}/columns`).send({ passcode: TEST_PASSCODE, name: 'Local Slang' });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe('local_slang');
  });
});

describe('Discovery job routes', () => {
  async function seedFilmId(app: ReturnType<typeof buildApp>['app']) {
    const res = await createFilm(app, { runDiscovery: false });
    return res.body.id as string;
  }

  it('creates a queued job with the requested instruction/columns, and lists it', async () => {
    const { app } = buildApp();
    const filmId = await seedFilmId(app);

    const created = await request(app)
      .post(`/api/films/${filmId}/discovery-jobs`)
      .send({ passcode: TEST_PASSCODE, specialInstruction: 'focus on jokes', targetColumns: ['segmentDescription'], testMode: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ agentNumber: 1, passNumber: 1, status: 'queued' });

    const list = await request(app).get(`/api/films/${filmId}/discovery-jobs?passcode=${TEST_PASSCODE}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].log).toBeUndefined(); // summary shape omits log/resultRows
  });

  it('requires a non-empty targetColumns array', async () => {
    const { app } = buildApp();
    const filmId = await seedFilmId(app);
    const res = await request(app)
      .post(`/api/films/${filmId}/discovery-jobs`)
      .send({ passcode: TEST_PASSCODE, targetColumns: [] });
    expect(res.status).toBe(400);
  });

  it('add/discard a result row on a finished job', async () => {
    const agent: DiscoveryAgent = {
      runPass: vi.fn().mockResolvedValue({
        resultRows: [
          { tempId: 't1', startMs: 0, endMs: 2000, subtitleText: 'Hello there', values: { segmentDescription: 'x' } },
        ],
        updatedConversation: [],
      }),
    };
    const { app, discoveryJobStore, detailRowsStore } = buildApp({ mockDiscoveryAgent: agent });
    const filmId = await seedFilmId(app);

    const job = await discoveryJobStore.createJob({ filmId, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });
    // Simulate the worker having finished it (route tests don't run the queue worker itself).
    await discoveryJobStore.updateJob(filmId, job.id, {
      status: 'done',
      resultRows: [{ tempId: 't1', startMs: 0, endMs: 2000, subtitleText: 'Hello there', values: { segmentDescription: 'x' } }],
    });

    const add = await request(app).post(`/api/films/${filmId}/discovery-jobs/${job.id}/results/t1/add`).send({ passcode: TEST_PASSCODE });
    expect(add.status).toBe(201);
    expect((await detailRowsStore.listRows(filmId))).toHaveLength(1);

    const afterAdd = await discoveryJobStore.getJob(filmId, job.id);
    expect(afterAdd?.resultRows).toHaveLength(0);
  });

  it('comment re-queues a finished job and appends to commentHistory', async () => {
    const { app, discoveryJobStore } = buildApp();
    const filmId = await seedFilmId(app);
    const job = await discoveryJobStore.createJob({ filmId, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });
    await discoveryJobStore.updateJob(filmId, job.id, { status: 'done' });

    const res = await request(app)
      .post(`/api/films/${filmId}/discovery-jobs/${job.id}/comment`)
      .send({ passcode: TEST_PASSCODE, comment: 'look at the second half too' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('queued');
    expect(res.body.commentHistory).toHaveLength(1);
  });

  it('rejects a comment while the job is still running', async () => {
    const { app, discoveryJobStore } = buildApp();
    const filmId = await seedFilmId(app);
    const job = await discoveryJobStore.createJob({ filmId, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });
    await discoveryJobStore.updateJob(filmId, job.id, { status: 'running' });

    const res = await request(app)
      .post(`/api/films/${filmId}/discovery-jobs/${job.id}/comment`)
      .send({ passcode: TEST_PASSCODE, comment: 'x' });
    expect(res.status).toBe(409);
  });

  it('the stream endpoint sends one frame and ends immediately for an already-terminal job', async () => {
    const { app, discoveryJobStore } = buildApp();
    const filmId = await seedFilmId(app);
    const job = await discoveryJobStore.createJob({ filmId, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });
    await discoveryJobStore.updateJob(filmId, job.id, { status: 'done' });

    const res = await request(app).get(`/api/films/${filmId}/discovery-jobs/${job.id}/stream?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"job_update"');
    expect(res.text).toContain('"status":"done"');
  });
});

describe('POST /api/films/:id/create-project', () => {
  it('builds project items from the film\'s curated Details rows', async () => {
    const { app, detailRowsStore } = buildApp();
    const created = await createFilm(app, { runDiscovery: false });
    const filmId = created.body.id;

    await detailRowsStore.addRow(filmId, {
      startMs: 0,
      endMs: 2000,
      subtitleText: 'Hello there',
      values: { segmentDescription: 'a scene' },
      provenance: { type: 'user-marked' },
    });

    const res = await request(app).post(`/api/films/${filmId}/create-project`).send({ passcode: TEST_PASSCODE, country: 'Japan' });
    expect(res.status).toBe(201);
    expect(res.body.items).toEqual([{ id: expect.any(String), scriptLine: 'Hello there', sceneDescription: 'a scene' }]);
  });

  it('returns 404/400 for an unknown film / missing country', async () => {
    const { app } = buildApp();
    const created = await createFilm(app, { runDiscovery: false });
    const filmId = created.body.id;

    expect((await request(app).post('/api/films/nope/create-project').send({ passcode: TEST_PASSCODE, country: 'Japan' })).status).toBe(404);
    expect((await request(app).post(`/api/films/${filmId}/create-project`).send({ passcode: TEST_PASSCODE })).status).toBe(400);
  });
});

describe('POST /api/films/upload-video', () => {
  it('mock mode writes the uploaded bytes to disk and serves them back over HTTP', async () => {
    const mockUploadsDir = await mkdtemp(path.join(tmpdir(), 'film-mock-uploads-'));
    try {
      const { app } = buildApp({ mockUploadsDir });
      const fileBytes = Buffer.from('fake video bytes');

      const uploadRes = await request(app)
        .post(`/api/films/upload-video?passcode=${TEST_PASSCODE}`)
        .field('testMode', 'true')
        .attach('video', fileBytes, { filename: 'clip.mp4', contentType: 'video/mp4' });

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.videoUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mock-uploads\/.+\.mp4\?passcode=test-passcode$/);

      const url = new URL(uploadRes.body.videoUrl);
      const getRes = await request(app).get(url.pathname + url.search);
      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-length']).toBe(String(fileBytes.length));
    } finally {
      await rm(mockUploadsDir, { recursive: true, force: true });
    }
  });
});
