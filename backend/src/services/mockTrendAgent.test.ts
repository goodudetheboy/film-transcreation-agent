import { describe, it, expect } from 'vitest';
import { createMockTrendAgent } from './mockTrendAgent.js';
import type { ResearchItem, ResearchResult, Rubric } from './researchAgent.js';

const RUBRICS: Rubric[] = [
  { id: 'food-aversion', description: 'food aversion', trendEligible: false },
  { id: 'slang-meme-reference', description: 'slang or memes', trendEligible: true },
];

function flaggedResult(itemId: string): ResearchResult {
  return {
    itemId,
    targetCountry: 'Brazil',
    scores: [{ rubricId: 'slang-meme-reference', score: 9, reasoning: 'r', evidence: 'e', sources: [] }],
    summary: 'summary',
    shouldTranscreate: true,
  };
}

describe('createMockTrendAgent', () => {
  it('returns a deterministic canned suggestion for an item mentioning "meme"', async () => {
    const agent = createMockTrendAgent();
    const item: ResearchItem = {
      id: 'a',
      scriptLine: "That's such an old meme, nobody says that anymore.",
      sceneDescription: 'A character references a dated meme',
    };

    const output = await agent.findTrendSuggestions({
      items: [{ item, result: flaggedResult('a') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(output['a']).toHaveLength(1);
    const suggestion = output['a'][0];
    expect(suggestion.text.length).toBeGreaterThan(0);
    expect(suggestion.justification.length).toBeGreaterThan(0);
    expect(suggestion.sourceUrl).toMatch(/^https?:\/\//);
    expect(suggestion.sourceTitle.length).toBeGreaterThan(0);
    expect(suggestion.publishedDate.length).toBeGreaterThan(0);
  });

  it('omits the itemId entirely for items with no recognizable trigger', async () => {
    const agent = createMockTrendAgent();
    const item: ResearchItem = {
      id: 'b',
      scriptLine: 'A perfectly ordinary line.',
      sceneDescription: 'Nothing trend-related here',
    };

    const output = await agent.findTrendSuggestions({
      items: [{ item, result: flaggedResult('b') }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(output).toEqual({});
  });

  it('returns an empty map for an empty item list', async () => {
    const agent = createMockTrendAgent();

    const output = await agent.findTrendSuggestions({ items: [], targetCountry: 'Brazil', rubrics: RUBRICS });

    expect(output).toEqual({});
  });
});
