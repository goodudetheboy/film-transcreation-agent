import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { createInMemoryFilmStore } from '../services/filmStore.js';
import { createInMemoryDetailRowsStore, type DetailRowsStore } from '../services/detailRowsStore.js';
import type { ResearchAgent, ResearchItem, ResearchResult } from '../services/researchAgent.js';
import type { TrendAgent } from '../services/trendAgent.js';
import type { TrendSuggestion } from '../services/projectTypes.js';

const TEST_PASSCODE = 'test-passcode';

function resultFor(item: ResearchItem, opts: { shouldTranscreate?: boolean } = {}): ResearchResult {
  const now = new Date().toISOString();
  return {
    itemId: item.id,
    targetCountry: 'Japan',
    scores: [
      {
        rubricId: 'some-rubric',
        score: opts.shouldTranscreate ? 9 : 1,
        reasoning: 'reason',
        evidence: 'evidence',
        sources: opts.shouldTranscreate ? ['https://example.com'] : [],
        updatedAt: now,
        updatedBy: 'batch-agent',
      },
    ],
    summary: opts.shouldTranscreate ? 'should change' : 'fine as-is',
    shouldTranscreate: Boolean(opts.shouldTranscreate),
    ...(opts.shouldTranscreate ? { suggestedReplacement: { text: 'replacement', justification: 'because' } } : {}),
  };
}

/** Batches results however the test wants, independent of the real BATCH_SIZE
 * chunking — the route only cares that onBatchComplete fires with real item ids. */
function fakeAgent(makeBatches: (items: ResearchItem[]) => ResearchResult[][]): ResearchAgent {
  return {
    researchBatch: vi.fn(async ({ items, onBatchComplete }) => {
      const batches = makeBatches(items);
      const all: ResearchResult[] = [];
      for (let i = 0; i < batches.length; i++) {
        const batchResults = batches[i];
        all.push(...batchResults);
        await onBatchComplete?.({
          batchIndex: i,
          totalBatches: batches.length,
          itemIds: batchResults.map((r) => r.itemId),
          results: batchResults,
        });
      }
      return all;
    }),
  };
}

function noChangeAgent(): ResearchAgent {
  return fakeAgent((items) => [items.map((i) => resultFor(i))]);
}

/** Returns the given suggestions regardless of item/rubrics passed in. */
function fakeTrendAgent(suggestions: TrendSuggestion[] = []): TrendAgent {
  return {
    findTrendSuggestions: vi.fn(async () => suggestions),
  };
}

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

/** Seeds a real film + N curated DetailRows, builds an app wired to those same
 * stores, and creates a project (with default rubrics) from all N rows via the
 * real film-first bridge route — the only way a project can be created now. */
async function seedAppAndProject(
  overrides: {
    researchAgent?: ResearchAgent;
    mockResearchAgent?: ResearchAgent;
    trendAgent?: TrendAgent;
    mockTrendAgent?: TrendAgent;
  } = {},
  rowCount = 1,
): Promise<{ app: Express; project: { id: string }; items: Array<{ id: string }> }> {
  const filmStore = createInMemoryFilmStore();
  const detailRowsStore: DetailRowsStore = createInMemoryDetailRowsStore();
  const film = await filmStore.createFilm({
    title: 'Inside Out',
    videoUrl: 'http://example.com/video.mp4',
    subtitle: null,
    runDiscoveryOnCreate: false,
  });
  const rows = await Promise.all(
    Array.from({ length: rowCount }, (_, i) =>
      detailRowsStore.addRow(film.id, {
        startMs: i * 1000,
        endMs: i * 1000 + 500,
        subtitleText: `line ${i}`,
        values: { segmentDescription: `scene ${i}` },
        provenance: { type: 'user-marked' },
      }),
    ),
  );

  const app = createApp({
    config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
    filmStore,
    detailRowsStore,
    researchAgent: overrides.researchAgent,
    mockResearchAgent: overrides.mockResearchAgent,
    trendAgent: overrides.trendAgent,
    mockTrendAgent: overrides.mockTrendAgent,
  });

  const created = await request(app)
    .post(`/api/films/${film.id}/projects`)
    .send({ passcode: TEST_PASSCODE, country: 'Japan', detailRowIds: rows.map((r) => r.id) });

  return { app, project: created.body.project as { id: string }, items: created.body.items as Array<{ id: string }> };
}

describe('POST /api/films/:filmId/projects (film-first creation)', () => {
  it('creates a project with server-assigned ids and default rubrics', async () => {
    const { app, project, items } = await seedAppAndProject();
    expect(project.id).toBeTruthy();
    expect(items[0].id).toBeTruthy();

    const rubrics = await request(app).get(`/api/projects/${project.id}/rubrics?passcode=${TEST_PASSCODE}`);
    expect(rubrics.body.length).toBeGreaterThan(0);
  });
});

describe('GET /api/projects and /api/projects/:id', () => {
  it('lists created projects enriched with counts/agentStatus, and fetches one by id', async () => {
    const { app, project } = await seedAppAndProject();

    const list = await request(app).get(`/api/projects?passcode=${TEST_PASSCODE}`);
    const found = list.body.find((p: { id: string }) => p.id === project.id);
    expect(found).toBeTruthy();
    expect(found).toMatchObject({ pendingCount: 1, acceptedCount: 0, rejectedCount: 0, needResearchCount: 0, agentStatus: null });

    const fetched = await request(app).get(`/api/projects/${project.id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(project.id);
  });

  it('returns 404 for an unknown project id', async () => {
    const { app } = await seedAppAndProject();
    const res = await request(app).get(`/api/projects/does-not-exist?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id/items/:itemId', () => {
  it('changes the action, scoped to the right project', async () => {
    const { app, project, items } = await seedAppAndProject();
    const res = await request(app)
      .patch(`/api/projects/${project.id}/items/${items[0].id}`)
      .send({ passcode: TEST_PASSCODE, action: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('accepted');
  });
});

describe('PATCH /api/projects/:id/items/:itemId/scores/:rubricId (manual score edit)', () => {
  it('upserts a rubric score with updatedBy "user" and recomputes importanceScore', async () => {
    const { app, project, items } = await seedAppAndProject();
    const rubric = await request(app)
      .post(`/api/projects/${project.id}/rubrics`)
      .send({ passcode: TEST_PASSCODE, name: 'Test', description: 'desc', weight: 4 });

    const res = await request(app)
      .patch(`/api/projects/${project.id}/items/${items[0].id}/scores/${rubric.body.id}`)
      .send({ passcode: TEST_PASSCODE, score: 8, reasoning: 'strong match', evidence: 'e' });

    expect(res.status).toBe(200);
    expect(res.body.scores).toEqual([
      expect.objectContaining({ rubricId: rubric.body.id, score: 8, reasoning: 'strong match', updatedBy: 'user' }),
    ]);
    expect(res.body.importanceScore).toBe(8);
  });
});

describe('POST /api/projects/:id/research-runs', () => {
  it('streams a progress event, one batch_done event per batch, then done, and persists results onto items', async () => {
    const agent = fakeAgent((items) => [[resultFor(items[0], { shouldTranscreate: true })], [resultFor(items[1])]]);
    const { app, project, items } = await seedAppAndProject({ mockResearchAgent: agent }, 2);
    await Promise.all(
      items.map((i) =>
        request(app).patch(`/api/projects/${project.id}/items/${i.id}`).send({ passcode: TEST_PASSCODE, action: 'need-research' }),
      ),
    );

    const res = await request(app)
      .post(`/api/projects/${project.id}/research-runs`)
      .send({ passcode: TEST_PASSCODE, mode: 'need-research' });

    const events = parseEvents(res.text);
    expect(events[0]).toMatchObject({ type: 'progress' });
    const batchEvents = events.filter((e) => e.type === 'batch_done');
    expect(batchEvents).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalItems: 2, totalRecommendedForChange: 1 } });

    const runs = await request(app).get(`/api/projects/${project.id}/research-runs?passcode=${TEST_PASSCODE}`);
    expect(runs.body[0]).toMatchObject({ status: 'done', mode: 'need-research', completedBatches: 2, totalBatches: 2 });

    const fetchedItems: Array<{ id: string; summary: string | null; shouldTranscreate: boolean | null; lastResearchedAt: string | null }> = (
      await request(app).get(`/api/projects/${project.id}/items?passcode=${TEST_PASSCODE}`)
    ).body;
    const changed = fetchedItems.find((i) => i.id === items[0].id)!;
    expect(changed.shouldTranscreate).toBe(true);
    expect(changed.summary).toBe('should change');
    expect(changed.lastResearchedAt).not.toBeNull();
  });

  it('defaults to the mock research agent, never touching the real one, unless testMode is explicitly false', async () => {
    const real = noChangeAgent();
    const mock = noChangeAgent();
    const { app, project, items } = await seedAppAndProject({ researchAgent: real, mockResearchAgent: mock });
    await request(app).patch(`/api/projects/${project.id}/items/${items[0].id}`).send({ passcode: TEST_PASSCODE, action: 'need-research' });

    await request(app).post(`/api/projects/${project.id}/research-runs`).send({ passcode: TEST_PASSCODE, mode: 'need-research' });

    expect(mock.researchBatch).toHaveBeenCalled();
    expect(real.researchBatch).not.toHaveBeenCalled();
  });

  it('uses the real research agent when testMode is explicitly false', async () => {
    const real = noChangeAgent();
    const mock = noChangeAgent();
    const { app, project, items } = await seedAppAndProject({ researchAgent: real, mockResearchAgent: mock });
    await request(app).patch(`/api/projects/${project.id}/items/${items[0].id}`).send({ passcode: TEST_PASSCODE, action: 'need-research' });

    await request(app)
      .post(`/api/projects/${project.id}/research-runs`)
      .send({ passcode: TEST_PASSCODE, mode: 'need-research', testMode: false });

    expect(real.researchBatch).toHaveBeenCalled();
    expect(mock.researchBatch).not.toHaveBeenCalled();
  });

  it('supports mode: "custom" with an explicit itemIds list', async () => {
    const agent = noChangeAgent();
    const { app, project, items } = await seedAppAndProject({ mockResearchAgent: agent }, 2);
    const res = await request(app)
      .post(`/api/projects/${project.id}/research-runs`)
      .send({ passcode: TEST_PASSCODE, mode: 'custom', itemIds: [items[0].id] });

    const events = parseEvents(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalItems: 1 } });
  });

  it('returns 400 for an invalid mode, and 400 when nothing matches', async () => {
    const { app, project } = await seedAppAndProject();
    expect(
      (await request(app).post(`/api/projects/${project.id}/research-runs`).send({ passcode: TEST_PASSCODE, mode: 'bogus' })).status,
    ).toBe(400);
    // fresh item defaults to 'pending', not 'need-research', so nothing matches
    expect(
      (await request(app).post(`/api/projects/${project.id}/research-runs`).send({ passcode: TEST_PASSCODE, mode: 'need-research' })).status,
    ).toBe(400);
  });

  it('returns 404 when the project does not exist', async () => {
    const { app } = await seedAppAndProject();
    const res = await request(app).post('/api/projects/does-not-exist/research-runs').send({ passcode: TEST_PASSCODE, mode: 'need-research' });
    expect(res.status).toBe(404);
  });

  it('writes an error event and marks the run errored when the agent throws', async () => {
    const agent: ResearchAgent = { researchBatch: vi.fn().mockRejectedValue(new Error('boom')) };
    const { app, project, items } = await seedAppAndProject({ mockResearchAgent: agent });
    await request(app).patch(`/api/projects/${project.id}/items/${items[0].id}`).send({ passcode: TEST_PASSCODE, action: 'need-research' });

    const res = await request(app).post(`/api/projects/${project.id}/research-runs`).send({ passcode: TEST_PASSCODE, mode: 'need-research' });

    const events = parseEvents(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('boom') });

    const runs = await request(app).get(`/api/projects/${project.id}/research-runs?passcode=${TEST_PASSCODE}`);
    expect(runs.body[0].status).toBe('error');
  });
});

describe('POST /api/projects/:id/items/:itemId/trend-research (manual, per-item)', () => {
  it('calls the mock Trend Agent by default and persists trendSuggestions, ungated (item never researched)', async () => {
    const trendSuggestion: TrendSuggestion = {
      text: 'use the current trend',
      justification: 'because',
      sourceUrl: 'https://example.com/trend',
      sourceTitle: 'Trend',
      publishedDate: '2026-05-01',
    };
    const trend = fakeTrendAgent([trendSuggestion]);
    const { app, project, items } = await seedAppAndProject({ mockTrendAgent: trend });
    await request(app)
      .post(`/api/projects/${project.id}/rubrics`)
      .send({ passcode: TEST_PASSCODE, name: 'Slang', description: 'slang or memes', weight: 3, trendEligible: true });

    // Item is still 'pending' and has never been researched (no scores, shouldTranscreate null) —
    // the manual button is the trigger, so this must still work.
    const res = await request(app)
      .post(`/api/projects/${project.id}/items/${items[0].id}/trend-research`)
      .send({ passcode: TEST_PASSCODE });

    expect(res.status).toBe(200);
    expect(res.body.trendSuggestions).toEqual([trendSuggestion]);
    expect(trend.findTrendSuggestions).toHaveBeenCalled();

    const fetched = await request(app).get(`/api/projects/${project.id}/items?passcode=${TEST_PASSCODE}`);
    expect(fetched.body.find((i: { id: string }) => i.id === items[0].id).trendSuggestions).toEqual([trendSuggestion]);
  });

  it('uses the real Trend Agent when testMode is explicitly false, never touching the mock', async () => {
    const real = fakeTrendAgent([
      { text: 't', justification: 'j', sourceUrl: 'https://example.com', sourceTitle: 's', publishedDate: '2026-05-01' },
    ]);
    const mock = fakeTrendAgent([]);
    const { app, project, items } = await seedAppAndProject({ trendAgent: real, mockTrendAgent: mock });
    await request(app)
      .post(`/api/projects/${project.id}/rubrics`)
      .send({ passcode: TEST_PASSCODE, name: 'Slang', description: 'slang or memes', weight: 3, trendEligible: true });

    await request(app)
      .post(`/api/projects/${project.id}/items/${items[0].id}/trend-research`)
      .send({ passcode: TEST_PASSCODE, testMode: false });

    expect(real.findTrendSuggestions).toHaveBeenCalled();
    expect(mock.findTrendSuggestions).not.toHaveBeenCalled();
  });

  it('returns 400 when the project has no trend-eligible rubric configured', async () => {
    const trend = fakeTrendAgent([{ text: 't', justification: 'j', sourceUrl: 'https://example.com', sourceTitle: 's', publishedDate: '2026-05-01' }]);
    const { app, project, items } = await seedAppAndProject({ mockTrendAgent: trend });
    // The default rubric set includes one trend-eligible rubric — remove every
    // rubric the project has so none remain trend-eligible.
    const rubrics = await request(app).get(`/api/projects/${project.id}/rubrics?passcode=${TEST_PASSCODE}`);
    for (const r of rubrics.body as Array<{ id: string }>) {
      await request(app).delete(`/api/projects/${project.id}/rubrics/${r.id}?passcode=${TEST_PASSCODE}`);
    }

    const res = await request(app)
      .post(`/api/projects/${project.id}/items/${items[0].id}/trend-research`)
      .send({ passcode: TEST_PASSCODE });

    expect(res.status).toBe(400);
    expect(trend.findTrendSuggestions).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown project or unknown item', async () => {
    const { app, project, items } = await seedAppAndProject();
    expect(
      (await request(app).post(`/api/projects/does-not-exist/items/${items[0].id}/trend-research`).send({ passcode: TEST_PASSCODE })).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/api/projects/${project.id}/items/does-not-exist/trend-research`).send({ passcode: TEST_PASSCODE })).status,
    ).toBe(404);
  });

  it('returns 500 with an error message when the Trend Agent throws, without persisting anything', async () => {
    const trend: TrendAgent = { findTrendSuggestions: vi.fn().mockRejectedValue(new Error('trend boom')) };
    const { app, project, items } = await seedAppAndProject({ mockTrendAgent: trend });
    await request(app)
      .post(`/api/projects/${project.id}/rubrics`)
      .send({ passcode: TEST_PASSCODE, name: 'Slang', description: 'slang or memes', weight: 3, trendEligible: true });

    const res = await request(app)
      .post(`/api/projects/${project.id}/items/${items[0].id}/trend-research`)
      .send({ passcode: TEST_PASSCODE });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('trend boom');
    const fetched = await request(app).get(`/api/projects/${project.id}/items?passcode=${TEST_PASSCODE}`);
    expect(fetched.body.find((i: { id: string }) => i.id === items[0].id).trendSuggestions).toBeNull();
  });
});

describe('GET /api/projects/:id/research-runs/:runId/stream (resumable)', () => {
  it('replays the current run document and ends immediately once terminal', async () => {
    const { app, project, items } = await seedAppAndProject();
    await request(app).patch(`/api/projects/${project.id}/items/${items[0].id}`).send({ passcode: TEST_PASSCODE, action: 'need-research' });
    await request(app).post(`/api/projects/${project.id}/research-runs`).send({ passcode: TEST_PASSCODE, mode: 'need-research' });

    const runs = await request(app).get(`/api/projects/${project.id}/research-runs?passcode=${TEST_PASSCODE}`);
    const runId = runs.body[0].id;

    const res = await request(app).get(`/api/projects/${project.id}/research-runs/${runId}/stream?passcode=${TEST_PASSCODE}`);
    const events = parseEvents(res.text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'run_update', run: { id: runId, status: 'done' } });
  });

  it('returns 404 for an unknown run', async () => {
    const { app, project } = await seedAppAndProject();
    const res = await request(app).get(`/api/projects/${project.id}/research-runs/does-not-exist/stream?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(404);
  });
});
