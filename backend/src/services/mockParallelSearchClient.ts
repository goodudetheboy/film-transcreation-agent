import type { ParallelSearchClient, ParallelSearchResultItem } from './parallelSearchClient.js';

const FOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 4;

/** Canned trend results, deliberately dated ~4 months in the past regardless of when
 * this runs — gives the frontend staleness indicator something real to render in
 * demo/test mode without the fixture itself going stale over time. */
function fixedResults(): ParallelSearchResultItem[] {
  const publishedDate = new Date(Date.now() - FOUR_MONTHS_MS).toISOString().slice(0, 10);
  return [
    {
      url: 'https://example.com/trends/local-slang-roundup',
      title: 'This month\'s viral slang and memes',
      snippet: 'A roundup of the phrases and memes currently circulating locally.',
      publishedDate,
    },
    {
      url: 'https://example.com/trends/meme-of-the-moment',
      title: 'The meme everyone is referencing right now',
      snippet: 'Context and origin of the current viral reference, with usage examples.',
      publishedDate,
    },
  ];
}

export function createMockParallelSearchClient(): ParallelSearchClient {
  return {
    async search() {
      return fixedResults();
    },
  };
}
