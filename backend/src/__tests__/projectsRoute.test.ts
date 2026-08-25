import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResearchAgent, ResearchResult } from '../services/researchAgent.js';

const TEST_PASSCODE = 'test-passcode';
const DEFAULT_RUBRICS = [{ id: 'food-aversion', description: 'test rubric' }];

function fakeAgent(resultsByBatch: ResearchResult[][] = [[]]): ResearchAgent {
  return {
    researchBatch: vi.fn(async ({ items, onBatchComplete }) => {
      const all: ResearchResult[] = [];
      for (let i = 0; i < resultsByBatch.length; i++) {
        const batchResults = resultsByBatch[i];
        all.push(...batchResults);
        onBatchComplete?.({
          batchIndex: i,
          totalBatches: resultsByBatch.length,
          itemIds: items.map((it) => it.id),
          results: batchResults,
        });
      }
      return all;
    }),
  };
}

function buildApp(overrides: { researchAgent?: ResearchAgent; mockResearchAgent?: ResearchAgent } = {}) {
  return createApp({
    config: {
      sharedPasscode: TEST_PASSCODE,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1000,
    },
    dialogflowClient: { analyzeScript: vi.fn() },
    researchAgent: overrides.researchAgent,
    mockResearchAgent: overrides.mockResearchAgent,
  });
}

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

async function createProject(app: import('express').Express, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/projects')
    .send({
      passcode: TEST_PASSCODE,
      country: 'Japan',
      items: [{ scriptLine: "I'm not eating that broccoli.", sceneDescription: 'a kid pushes away a plate' }],
      rubrics: DEFAULT_RUBRICS,
      ...overrides,
    });
  return res;
}

describe('POST /api/projects', () => {
  it('creates a project with server-assigned ids', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const res = await createProject(app);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.country).toBe('Japan');
    expect(res.body.status).toBe('draft');
    expect(res.body.items[0].id).toBeTruthy();
    expect(res.body.items[0].scriptLine).toBe("I'm not eating that broccoli.");
  });

  it('falls back to default rubrics when none are provided', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const res = await request(app)
      .post('/api/projects')
      .send({
        passcode: TEST_PASSCODE,
        country: 'Japan',
        items: [{ scriptLine: 'x', sceneDescription: 'y' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.rubrics.length).toBeGreaterThan(0);
  });

  it('returns 400 when country is missing', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const res = await createProject(app, { country: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 400 when items is empty', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const res = await createProject(app, { items: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects and /api/projects/:id', () => {
  it('lists created projects and fetches one by id', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const created = await createProject(app);

    const list = await request(app).get(`/api/projects?passcode=${TEST_PASSCODE}`);
    expect(list.body.some((p: { id: string }) => p.id === created.body.id)).toBe(true);

    const fetched = await request(app).get(`/api/projects/${created.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('returns 404 for an unknown project id', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const res = await request(app).get(`/api/projects/does-not-exist?passcode=${TEST_PASSCODE}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/projects/:id/research', () => {
  it('streams a progress event, one batch_done event per batch, then done, and persists results', async () => {
    const finding: ResearchResult = {
      itemId: 'placeholder',
      targetCountry: 'Japan',
      scores: [
        {
          rubricId: 'food-aversion',
          score: 9,
          reasoning: 'reason',
          evidence: 'evidence',
          sources: ['https://example.com'],
        },
      ],
      summary: 'should change',
      shouldTranscreate: true,
      suggestedReplacement: { text: 'replacement', justification: 'because' },
    };
    const agent = fakeAgent([[finding], []]);
    const app = buildApp({ mockResearchAgent: agent });
    const created = await createProject(app);

    const res = await request(app)
      .post(`/api/projects/${created.body.id}/research`)
      .send({ passcode: TEST_PASSCODE });

    const events = parseEvents(res.text);
    expect(events[0]).toMatchObject({ type: 'progress' });
    const batchEvents = events.filter((e) => e.type === 'batch_done');
    expect(batchEvents).toHaveLength(2);
    expect(batchEvents[0]).toMatchObject({ batchIndex: 0, totalBatches: 2 });
    expect(events.at(-1)).toMatchObject({ type: 'done', summary: { totalRecommendedForChange: 1 } });

    const fetched = await request(app).get(`/api/projects/${created.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.body.status).toBe('done');
    expect(fetched.body.results).toHaveLength(1);
    expect(fetched.body.batches).toHaveLength(2);
  });

  it('returns 404 when the project does not exist', async () => {
    const app = buildApp({ mockResearchAgent: fakeAgent() });
    const res = await request(app)
      .post('/api/projects/does-not-exist/research')
      .send({ passcode: TEST_PASSCODE });
    expect(res.status).toBe(404);
  });

  it('defaults to the mock research agent, never touching the real one, unless testMode is explicitly false', async () => {
    const real = fakeAgent([[{ itemId: 'x', targetCountry: 'Japan', scores: [], summary: 'fine', shouldTranscreate: false }]]);
    const mock = fakeAgent([[{ itemId: 'x', targetCountry: 'Japan', scores: [], summary: 'fine', shouldTranscreate: false }]]);
    const app = buildApp({ researchAgent: real, mockResearchAgent: mock });
    const created = await createProject(app);

    await request(app).post(`/api/projects/${created.body.id}/research`).send({ passcode: TEST_PASSCODE });

    expect(mock.researchBatch).toHaveBeenCalled();
    expect(real.researchBatch).not.toHaveBeenCalled();
  });

  it('uses the real research agent when testMode is explicitly false', async () => {
    const real = fakeAgent([[{ itemId: 'x', targetCountry: 'Japan', scores: [], summary: 'fine', shouldTranscreate: false }]]);
    const mock = fakeAgent([[{ itemId: 'x', targetCountry: 'Japan', scores: [], summary: 'fine', shouldTranscreate: false }]]);
    const app = buildApp({ researchAgent: real, mockResearchAgent: mock });
    const created = await createProject(app);

    await request(app)
      .post(`/api/projects/${created.body.id}/research`)
      .send({ passcode: TEST_PASSCODE, testMode: false });

    expect(real.researchBatch).toHaveBeenCalled();
    expect(mock.researchBatch).not.toHaveBeenCalled();
  });

  it('writes an error event and marks the project errored when the agent throws', async () => {
    const agent: ResearchAgent = {
      researchBatch: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const app = buildApp({ mockResearchAgent: agent });
    const created = await createProject(app);

    const res = await request(app)
      .post(`/api/projects/${created.body.id}/research`)
      .send({ passcode: TEST_PASSCODE });

    const events = parseEvents(res.text);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('boom') });

    const fetched = await request(app).get(`/api/projects/${created.body.id}?passcode=${TEST_PASSCODE}`);
    expect(fetched.body.status).toBe('error');
  });
});
