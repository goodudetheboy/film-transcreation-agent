import { describe, it, expect } from 'vitest';
import { createMockParallelSearchClient } from './mockParallelSearchClient.js';

describe('createMockParallelSearchClient', () => {
  it('returns a fixed set of results regardless of the query', async () => {
    const client = createMockParallelSearchClient();

    const a = await client.search({ query: 'anything' });
    const b = await client.search({ query: 'something else entirely' });

    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('returns results with a real url, title, snippet, and a published date several months in the past', async () => {
    const client = createMockParallelSearchClient();

    const results = await client.search({ query: 'anything' });

    for (const r of results) {
      expect(r.url).toMatch(/^https?:\/\//);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.snippet.length).toBeGreaterThan(0);
      expect(r.publishedDate).not.toBeNull();
    }
    const oldest = results[0].publishedDate as string;
    const ageMs = Date.now() - new Date(oldest).getTime();
    const threeMonthsMs = 1000 * 60 * 60 * 24 * 30 * 3;
    expect(ageMs).toBeGreaterThan(threeMonthsMs);
  });
});
