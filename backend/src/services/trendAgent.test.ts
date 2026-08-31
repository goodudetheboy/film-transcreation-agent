import { describe, it, expect, vi } from 'vitest';
import { createTrendAgent } from './trendAgent.js';
import type { GenAIClient, ResearchItem, Rubric } from './researchAgent.js';
import type { ParallelSearchClient, ParallelSearchResultItem } from './parallelSearchClient.js';

const CONFIG = {
  googleCloudProject: 'test-project',
  geminiLocation: 'us-central1',
  geminiModel: 'gemini-2.5-flash',
};

const TREND_RUBRIC: Rubric = {
  id: 'slang-meme-reference',
  projectId: 'proj-a',
  name: 'Slang / meme reference',
  description: 'slang or memes tied to a moment',
  weight: 3,
  trendEligible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ITEM: ResearchItem = {
  id: 'item-a',
  scriptLine: "That's such an old meme, nobody says that anymore.",
  sceneDescription: 'A character references a dated meme',
};

function fakeGenAI(generateContent: GenAIClient['models']['generateContent']): GenAIClient {
  return { models: { generateContent } };
}

function fakeParallel(search: ParallelSearchClient['search']): ParallelSearchClient {
  return { search };
}

function searchResult(overrides: Partial<ParallelSearchResultItem> = {}): ParallelSearchResultItem {
  return {
    url: 'https://example.com/trend-a',
    title: 'Trend A',
    snippet: 'about trend a',
    publishedDate: '2026-05-01',
    ...overrides,
  };
}

describe('createTrendAgent findTrendSuggestions (single item, ungated — caller decides when to call)', () => {
  it('returns an empty array and makes no calls when given no rubrics', async () => {
    const search = vi.fn(async () => []);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const result = await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [] });

    expect(result).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('searches once per given rubric using a query built from the rubric and scene context, with no score/gating check', async () => {
    const search = vi.fn(async () => [searchResult()]);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(search).toHaveBeenCalledTimes(1);
    const query = search.mock.calls[0][0].query;
    expect(query).toContain('Brazil');
    expect(query).toContain('A character references a dated meme');
    expect(query).toContain('slang or memes tied to a moment');
  });

  it('skips the Gemini call and returns an empty array when the search finds nothing', async () => {
    const search = vi.fn(async () => []);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const result = await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(result).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('attaches sourceUrl/sourceTitle/publishedDate from the matching search result, not from model text', async () => {
    const result = searchResult({
      url: 'https://example.com/real-source',
      title: 'Real Title',
      publishedDate: '2026-01-15',
    });
    const search = vi.fn(async () => [result]);
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify([
        { text: 'use this trending phrase', justification: 'it fits', source_url: 'https://example.com/real-source' },
      ]),
    }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(output).toEqual([
      {
        text: 'use this trending phrase',
        justification: 'it fits',
        sourceUrl: 'https://example.com/real-source',
        sourceTitle: 'Real Title',
        publishedDate: '2026-01-15',
      },
    ]);
  });

  it("drops a suggestion whose source_url doesn't match any search result", async () => {
    const search = vi.fn(async () => [searchResult({ url: 'https://example.com/real-source' })]);
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify([
        { text: 'fabricated', justification: 'because', source_url: 'https://example.com/made-up-not-in-results' },
      ]),
    }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(output).toEqual([]);
  });

  it('caps suggestions at 2 even if the model returns more', async () => {
    const validResult = searchResult({ url: 'https://example.com/real-source' });
    const search = vi.fn(async () => [validResult]);
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify([
        { text: '1', justification: 'j1', source_url: validResult.url },
        { text: '2', justification: 'j2', source_url: validResult.url },
        { text: '3', justification: 'j3', source_url: validResult.url },
      ]),
    }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(output).toHaveLength(2);
  });

  it('searches every given rubric and merges results into one Gemini call when more than one trend-eligible rubric is passed', async () => {
    const otherRubric: Rubric = { ...TREND_RUBRIC, id: 'viral-catchphrase', name: 'Viral catchphrase', description: 'a viral catchphrase' };
    const search = vi.fn(async ({ query }: { query: string }) => [
      searchResult({ url: query.includes('viral catchphrase') ? 'https://example.com/b' : 'https://example.com/a' }),
    ]);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    await agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC, otherRubric] });

    expect(search).toHaveBeenCalledTimes(2);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error on an empty Gemini response', async () => {
    const search = vi.fn(async () => [searchResult()]);
    const generateContent = vi.fn(async () => ({ text: undefined }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    await expect(
      agent.findTrendSuggestions({ item: ITEM, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] }),
    ).rejects.toThrow(/empty response/);
  });
});
