import { describe, it, expect, vi } from 'vitest';
import { createTrendAgent } from './trendAgent.js';
import type { GenAIClient, ResearchItem, ResearchResult, Rubric } from './researchAgent.js';
import type { ParallelSearchClient, ParallelSearchResultItem } from './parallelSearchClient.js';

const CONFIG = {
  googleCloudProject: 'test-project',
  geminiLocation: 'us-central1',
  geminiModel: 'gemini-2.5-flash',
};

const RUBRICS: Rubric[] = [
  { id: 'food-aversion', description: 'food aversion', trendEligible: false },
  { id: 'slang-meme-reference', description: 'slang or memes tied to a moment', trendEligible: true },
];

function item(id: string): ResearchItem {
  return { id, scriptLine: `line for ${id}`, sceneDescription: `scene for ${id}` };
}

function flaggedResult(id: string): ResearchResult {
  return {
    itemId: id,
    targetCountry: 'Brazil',
    scores: [{ rubricId: 'slang-meme-reference', score: 9, reasoning: 'r', evidence: 'e', sources: [] }],
    summary: 'summary',
    shouldTranscreate: true,
  };
}

function fakeGenAI(generateContent: GenAIClient['models']['generateContent']): GenAIClient {
  return { models: { generateContent } };
}

function fakeParallel(
  search: ParallelSearchClient['search'],
): ParallelSearchClient {
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

describe('createTrendAgent findTrendSuggestions', () => {
  it('returns an empty map and makes no calls when given no items', async () => {
    const search = vi.fn(async () => []);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const result = await agent.findTrendSuggestions({ items: [], targetCountry: 'Brazil', rubrics: RUBRICS });

    expect(result).toEqual({});
    expect(search).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('does not search when the only trend-eligible rubric score is low (item flagged for an unrelated reason)', async () => {
    const search = vi.fn(async () => [searchResult()]);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    // shouldTranscreate is true (e.g. a broccoli-style food-aversion match), but the
    // trend-eligible rubric itself scored low — exhaustive scoring means every rubric
    // always has an entry, so presence alone must not be enough to trigger a search.
    const result = await agent.findTrendSuggestions({
      items: [
        {
          item: item('a'),
          result: {
            itemId: 'a',
            targetCountry: 'Brazil',
            scores: [
              { rubricId: 'food-aversion', score: 9, reasoning: 'r', evidence: 'e', sources: [] },
              { rubricId: 'slang-meme-reference', score: 1, reasoning: 'no signal', evidence: 'e', sources: [] },
            ],
            summary: 'summary',
            shouldTranscreate: true,
          },
        },
      ],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(result).toEqual({});
    expect(search).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('searches once per item using a query built from the triggering rubric and scene context', async () => {
    const search = vi.fn(async () => [searchResult()]);
    const generateContent = vi.fn(async () => ({ text: '[]' }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    await agent.findTrendSuggestions({
      items: [{ item: item('a'), result: flaggedResult('a') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(search).toHaveBeenCalledTimes(1);
    const query = search.mock.calls[0][0].query;
    expect(query).toContain('Brazil');
    expect(query).toContain('scene for a');
    expect(query).toContain('slang or memes tied to a moment');
  });

  it('attaches sourceUrl/sourceTitle/publishedDate from the matching search result, not from model text', async () => {
    const result = searchResult({
      url: 'https://example.com/real-source',
      title: 'Real Title',
      publishedDate: '2026-01-15',
    });
    const search = vi.fn(async () => [result]);
    const generateContent = vi.fn(async () =>
      ({
        text: JSON.stringify([
          {
            item_id: 'a',
            suggestions: [
              {
                text: 'use this trending phrase',
                justification: 'it fits',
                source_url: 'https://example.com/real-source',
              },
            ],
          },
        ]),
      }),
    );
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({
      items: [{ item: item('a'), result: flaggedResult('a') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(output['a']).toEqual([
      {
        text: 'use this trending phrase',
        justification: 'it fits',
        sourceUrl: 'https://example.com/real-source',
        sourceTitle: 'Real Title',
        publishedDate: '2026-01-15',
      },
    ]);
  });

  it("drops a suggestion whose source_url doesn't match any of that item's search results", async () => {
    const search = vi.fn(async () => [searchResult({ url: 'https://example.com/real-source' })]);
    const generateContent = vi.fn(async () =>
      ({
        text: JSON.stringify([
          {
            item_id: 'a',
            suggestions: [
              {
                text: 'fabricated',
                justification: 'because',
                source_url: 'https://example.com/made-up-not-in-results',
              },
            ],
          },
        ]),
      }),
    );
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({
      items: [{ item: item('a'), result: flaggedResult('a') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(output).not.toHaveProperty('a');
  });

  it('omits an itemId entirely when the model returns no suggestions for it', async () => {
    const search = vi.fn(async () => [searchResult()]);
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify([{ item_id: 'a', suggestions: [] }]),
    }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({
      items: [{ item: item('a'), result: flaggedResult('a') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(output).toEqual({});
  });

  it('caps suggestions at 2 per item even if the model returns more', async () => {
    const validResult = searchResult({ url: 'https://example.com/real-source' });
    const search = vi.fn(async () => [validResult]);
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify([
        {
          item_id: 'a',
          suggestions: [
            { text: '1', justification: 'j1', source_url: validResult.url },
            { text: '2', justification: 'j2', source_url: validResult.url },
            { text: '3', justification: 'j3', source_url: validResult.url },
          ],
        },
      ]),
    }));
    const agent = createTrendAgent(CONFIG, {
      genAI: fakeGenAI(generateContent),
      parallelSearchClient: fakeParallel(search),
    });

    const output = await agent.findTrendSuggestions({
      items: [{ item: item('a'), result: flaggedResult('a') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(output['a']).toHaveLength(2);
  });
});
