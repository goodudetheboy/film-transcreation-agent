import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createProjectFromFilm } from '../../frontend/src/api/filmsApiClient';
import {
  listRubrics,
  listItems,
  streamResearchRun,
  createChatSession,
  runTrendResearch,
} from '../../frontend/src/api/projectsApiClient';
import { sendChatMessage } from '../../frontend/src/api/projectChatApiClient';
import type { ChatStreamEvent, ResearchRunStreamEvent } from '../../frontend/src/api/apiClient.types';
import { startTestBackend, type TestBackend } from './helpers/startTestBackend';
import { fakeResearchAgent } from './helpers/fakeResearchAgent';
import { fakeResearchChatAgent } from './helpers/fakeResearchChatAgent';
import { fakeTrendAgent } from './helpers/fakeTrendAgent';
import { createInMemoryFilmStore } from '../../backend/src/services/filmStore';
import { createInMemoryDetailRowsStore } from '../../backend/src/services/detailRowsStore';
import { createInMemoryProjectStore } from '../../backend/src/services/projectStore';
import { createInMemoryProjectRubricStore } from '../../backend/src/services/projectRubricStore';
import { createInMemoryProjectItemStore } from '../../backend/src/services/projectItemStore';
import { createInMemoryResearchRunStore } from '../../backend/src/services/researchRunStore';
import { createInMemoryChatSessionStore } from '../../backend/src/services/chatSessionStore';

const TEST_PASSCODE = 'integration-test-passcode';

describe('frontend project APIs -> real backend -> faked research/chat agents', () => {
  let backend: TestBackend;
  let filmId: string;
  let rowId: string;

  beforeAll(async () => {
    const filmStore = createInMemoryFilmStore();
    const detailRowsStore = createInMemoryDetailRowsStore();
    const projectStore = createInMemoryProjectStore();
    const projectRubricStore = createInMemoryProjectRubricStore();
    const projectItemStore = createInMemoryProjectItemStore();
    const researchRunStore = createInMemoryResearchRunStore();
    const chatSessionStore = createInMemoryChatSessionStore();

    const film = await filmStore.createFilm({
      title: 'Integration Film',
      videoUrl: 'http://example.com/clip.mp4',
      subtitle: null,
      runDiscoveryOnCreate: false,
    });
    filmId = film.id;
    const row = await detailRowsStore.addRow(film.id, {
      startMs: 0,
      endMs: 2000,
      subtitleText: "I'm not eating that broccoli.",
      values: { segmentDescription: 'Riley pushes a plate of broccoli away at the dinner table' },
      provenance: { type: 'user-marked' },
    });
    rowId = row.id;

    const researchAgent = fakeResearchAgent([
      [
        {
          targetCountry: 'Japan',
          scores: [
            {
              rubricId: 'placeholder',
              score: 9,
              reasoning: 'Broccoli reads as a disliked vegetable to American kids, but not to Japanese kids.',
              evidence: "Documented case: Pixar re-animated this exact line for Inside Out's Japanese release.",
              sources: ['https://www.businessinsider.com/inside-out-pixar-broccoli-japan-2015-6'],
              updatedAt: new Date().toISOString(),
              updatedBy: 'batch-agent',
            },
          ],
          summary: 'The broccoli line does not translate to Japan and should be transcreated.',
          shouldTranscreate: true,
          suggestedReplacement: {
            text: 'Swap the disliked food for one Japanese kids commonly dislike.',
            justification: 'Matches the real Pixar localization precedent for this exact scene.',
          },
        },
      ],
    ]);
    const researchChatAgent = fakeResearchChatAgent({ projectItemStore, projectRubricStore, chatSessionStore });

    backend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
      filmStore,
      detailRowsStore,
      projectStore,
      projectRubricStore,
      projectItemStore,
      researchRunStore,
      chatSessionStore,
      researchAgent,
      researchChatAgent,
    });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('creates a film-first project, runs research end-to-end, then a chat turn patches an item live', async () => {
    // No fetchImpl override anywhere in this file — real fetch, real TCP, real Express app.
    // Only backend.researchAgent/researchChatAgent (injected above) are fake.
    const { project, items } = await createProjectFromFilm(
      filmId,
      { passcode: TEST_PASSCODE, country: 'Japan', detailRowIds: [rowId] },
      { baseUrl: backend.url },
    );

    expect(project.id).toBeTruthy();
    expect(project.sourceFilmId).toBe(filmId);
    expect(items).toHaveLength(1);
    expect(items[0].subtitleText).toBe("I'm not eating that broccoli.");
    expect(items[0].action).toBe('need-research');

    const rubrics = await listRubrics(project.id, TEST_PASSCODE, { baseUrl: backend.url });
    expect(rubrics.length).toBeGreaterThan(0); // fell back to DEFAULT_RUBRICS

    const runEvents: ResearchRunStreamEvent[] = [];
    await streamResearchRun(
      project.id,
      { passcode: TEST_PASSCODE, testMode: false, mode: 'need-research' }, // testMode:false reaches the injected fake researchAgent
      (e) => runEvents.push(e),
      { baseUrl: backend.url },
    );

    expect(runEvents[0]).toMatchObject({ type: 'progress' });
    expect(runEvents.at(-1)).toMatchObject({ type: 'done', summary: { totalItems: 1, totalRecommendedForChange: 1 } });

    const afterRun = await listItems(project.id, TEST_PASSCODE, { baseUrl: backend.url });
    expect(afterRun[0].shouldTranscreate).toBe(true);
    expect(afterRun[0].summary).toContain('does not translate to Japan');
    // The agent just finished researching a fresh item — bumped from need-research to
    // pending so the user knows there's now something to review.
    expect(afterRun[0].action).toBe('pending');

    // Now open a chat session and send a message that triggers the fake chat
    // agent's canned tool call — confirms the SSE round trip AND that the
    // resulting ProjectItem write is real, visible via a fresh GET.
    const session = await createChatSession(project.id, { passcode: TEST_PASSCODE }, { baseUrl: backend.url });
    const chatEvents: ChatStreamEvent[] = [];
    await sendChatMessage(
      project.id,
      session.id,
      { passcode: TEST_PASSCODE, text: 'what do you think of this line?', testMode: false, itemId: items[0].id },
      (e) => chatEvents.push(e),
      { baseUrl: backend.url },
    );

    expect(chatEvents.some((e) => e.type === 'tool_call' && e.name === 'update_rubric_score')).toBe(true);
    expect(chatEvents.some((e) => e.type === 'item_patched')).toBe(true);
    expect(chatEvents.at(-1)).toEqual({ type: 'turn_done' });

    const afterChat = await listItems(project.id, TEST_PASSCODE, { baseUrl: backend.url });
    const chatPatchedScore = afterChat[0].scores.find((s) => s.updatedBy === 'chat-agent');
    expect(chatPatchedScore).toMatchObject({ score: 7, updatedBy: 'chat-agent' });
  });

  it('rejects project creation with an error when the passcode is wrong', async () => {
    await expect(
      createProjectFromFilm(
        filmId,
        { passcode: 'wrong', country: 'Japan', detailRowIds: [rowId] },
        { baseUrl: backend.url },
      ),
    ).rejects.toThrow(/401/);
  });
});

describe('frontend project APIs -> real backend -> faked Trend Agent (manual, per-item)', () => {
  let backend: TestBackend;
  let filmId: string;
  let rowId: string;

  beforeAll(async () => {
    const filmStore = createInMemoryFilmStore();
    const detailRowsStore = createInMemoryDetailRowsStore();

    const film = await filmStore.createFilm({
      title: 'Trend Integration Film',
      videoUrl: 'http://example.com/clip2.mp4',
      subtitle: null,
      runDiscoveryOnCreate: false,
    });
    filmId = film.id;
    const row = await detailRowsStore.addRow(film.id, {
      startMs: 0,
      endMs: 2000,
      subtitleText: 'that meme is so played out',
      values: { segmentDescription: 'a character references a dated meme' },
      provenance: { type: 'user-marked' },
    });
    rowId = row.id;

    const trendSuggestion = {
      text: 'use the current trend',
      justification: 'because it is what is circulating locally right now',
      sourceUrl: 'https://example.com/trend',
      sourceTitle: 'Trend Roundup',
      publishedDate: '2026-05-01',
    };

    backend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000 },
      filmStore,
      detailRowsStore,
      trendAgent: fakeTrendAgent([trendSuggestion]),
    });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('runs the Trend Agent for a single item on demand, ungated — item has never been researched', async () => {
    const { project, items } = await createProjectFromFilm(
      filmId,
      {
        passcode: TEST_PASSCODE,
        country: 'Brazil',
        detailRowIds: [rowId],
        rubrics: [{ name: 'Slang', description: 'slang or memes tied to a moment', weight: 3, trendEligible: true }],
      },
      { baseUrl: backend.url },
    );

    // No research run at all — item is still 'pending', shouldTranscreate is null.
    // The manual button is the trigger, so this must still work end-to-end.
    const updated = await runTrendResearch(
      project.id,
      items[0].id,
      { passcode: TEST_PASSCODE, testMode: false },
      { baseUrl: backend.url },
    );

    expect(updated.trendSuggestions).toEqual([
      {
        text: 'use the current trend',
        justification: 'because it is what is circulating locally right now',
        sourceUrl: 'https://example.com/trend',
        sourceTitle: 'Trend Roundup',
        publishedDate: '2026-05-01',
      },
    ]);

    const afterRun = await listItems(project.id, TEST_PASSCODE, { baseUrl: backend.url });
    expect(afterRun[0].trendSuggestions).toEqual(updated.trendSuggestions);
  });

  it('returns 400 when the project has no trend-eligible rubric configured', async () => {
    const { project, items } = await createProjectFromFilm(
      filmId,
      {
        passcode: TEST_PASSCODE,
        country: 'Brazil',
        detailRowIds: [rowId],
        rubrics: [{ name: 'Wordplay', description: 'wordplay', weight: 3, trendEligible: false }],
      },
      { baseUrl: backend.url },
    );

    await expect(
      runTrendResearch(project.id, items[0].id, { passcode: TEST_PASSCODE, testMode: false }, { baseUrl: backend.url }),
    ).rejects.toThrow(/400/);
  });
});
