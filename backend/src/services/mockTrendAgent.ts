import type { TrendAgent } from './trendAgent.js';
import type { TrendSuggestion } from './researchAgent.js';

const FOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 4;

/** Canned trend suggestion, deterministically triggered by the word "meme" — same
 * "broccoli" convention as mockResearchAgent.ts: a recognizable fixture case for
 * demos/tests, no network or Gemini calls. */
function mockSuggestion(): TrendSuggestion {
  return {
    text: 'Swap the dated meme reference for whatever\'s currently circulating locally.',
    justification: 'Mock trend data — a real run would ground this in a live, dated search result.',
    sourceUrl: 'https://example.com/trends/meme-of-the-moment',
    sourceTitle: 'The meme everyone is referencing right now',
    publishedDate: new Date(Date.now() - FOUR_MONTHS_MS).toISOString().slice(0, 10),
  };
}

export function createMockTrendAgent(): TrendAgent {
  return {
    async findTrendSuggestions({ item, rubrics }) {
      if (rubrics.length === 0) return [];
      const haystack = `${item.scriptLine} ${item.sceneDescription}`.toLowerCase();
      return haystack.includes('meme') ? [mockSuggestion()] : [];
    },
  };
}
