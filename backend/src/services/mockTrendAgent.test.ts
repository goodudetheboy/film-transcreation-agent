import { describe, it, expect } from 'vitest';
import { createMockTrendAgent } from './mockTrendAgent.js';
import type { ResearchItem, Rubric } from './researchAgent.js';

const TREND_RUBRIC: Rubric = {
  id: 'slang-meme-reference',
  projectId: 'proj-a',
  name: 'Slang / meme reference',
  description: 'slang or memes',
  weight: 3,
  trendEligible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('createMockTrendAgent', () => {
  it('returns a deterministic canned suggestion for an item mentioning "meme"', async () => {
    const agent = createMockTrendAgent();
    const item: ResearchItem = {
      id: 'a',
      scriptLine: "That's such an old meme, nobody says that anymore.",
      sceneDescription: 'A character references a dated meme',
    };

    const output = await agent.findTrendSuggestions({ item, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(output).toHaveLength(1);
    expect(output[0].text.length).toBeGreaterThan(0);
    expect(output[0].justification.length).toBeGreaterThan(0);
    expect(output[0].sourceUrl).toMatch(/^https?:\/\//);
    expect(output[0].sourceTitle.length).toBeGreaterThan(0);
    expect(output[0].publishedDate.length).toBeGreaterThan(0);
  });

  it('returns an empty array for an item with no recognizable trigger', async () => {
    const agent = createMockTrendAgent();
    const item: ResearchItem = {
      id: 'b',
      scriptLine: 'A perfectly ordinary line.',
      sceneDescription: 'Nothing trend-related here',
    };

    const output = await agent.findTrendSuggestions({ item, targetCountry: 'Brazil', rubrics: [TREND_RUBRIC] });

    expect(output).toEqual([]);
  });

  it('returns an empty array when no rubrics are given, even for a "meme" item', async () => {
    const agent = createMockTrendAgent();
    const item: ResearchItem = {
      id: 'a',
      scriptLine: "That's such an old meme, nobody says that anymore.",
      sceneDescription: 'A character references a dated meme',
    };

    const output = await agent.findTrendSuggestions({ item, targetCountry: 'Brazil', rubrics: [] });

    expect(output).toEqual([]);
  });
});
