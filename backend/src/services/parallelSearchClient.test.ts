import { describe, it, expect, vi } from 'vitest';
import { createParallelSearchClient, type ParallelClientLike } from './parallelSearchClient.js';

function fakeParallelClient(search: ParallelClientLike['search']): ParallelClientLike {
  return { search };
}

describe('createParallelSearchClient', () => {
  it('sends the query as a single search_queries entry', async () => {
    const search = vi.fn(async () => ({ results: [] }));
    const client = createParallelSearchClient({ apiKey: 'k' }, { client: fakeParallelClient(search) });

    await client.search({ query: 'trending slang in Brazil' });

    expect(search).toHaveBeenCalledWith({ search_queries: ['trending slang in Brazil'] });
  });

  it('maps url/title/publish_date and joins excerpts into a snippet', async () => {
    const search = vi.fn(async () => ({
      results: [
        {
          url: 'https://example.com/a',
          title: 'A trend',
          excerpts: ['first excerpt.', 'second excerpt.'],
          publish_date: '2026-05-01',
        },
      ],
    }));
    const client = createParallelSearchClient({ apiKey: 'k' }, { client: fakeParallelClient(search) });

    const results = await client.search({ query: 'anything' });

    expect(results).toEqual([
      {
        url: 'https://example.com/a',
        title: 'A trend',
        snippet: 'first excerpt. second excerpt.',
        publishedDate: '2026-05-01',
      },
    ]);
  });

  it('falls back to an empty title and null publishedDate when the source omits them', async () => {
    const search = vi.fn(async () => ({
      results: [{ url: 'https://example.com/b', title: null, excerpts: [], publish_date: null }],
    }));
    const client = createParallelSearchClient({ apiKey: 'k' }, { client: fakeParallelClient(search) });

    const results = await client.search({ query: 'anything' });

    expect(results).toEqual([
      { url: 'https://example.com/b', title: '', snippet: '', publishedDate: null },
    ]);
  });

  it('returns an empty array when Parallel finds no results', async () => {
    const search = vi.fn(async () => ({ results: [] }));
    const client = createParallelSearchClient({ apiKey: 'k' }, { client: fakeParallelClient(search) });

    const results = await client.search({ query: 'anything' });

    expect(results).toEqual([]);
  });
});
