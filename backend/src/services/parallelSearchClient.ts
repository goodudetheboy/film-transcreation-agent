import Parallel from 'parallel-web';

export interface ParallelSearchResultItem {
  url: string;
  title: string;
  snippet: string;
  publishedDate: string | null;
}

export interface ParallelSearchClient {
  search(input: { query: string }): Promise<ParallelSearchResultItem[]>;
}

/** Narrow slice of the parallel-web client this service actually calls — lets tests
 * inject a fake without touching a real API key or the real SDK. */
export interface ParallelClientLike {
  search(params: { search_queries: string[] }): Promise<{
    results: Array<{
      url: string;
      title?: string | null;
      excerpts: string[];
      publish_date?: string | null;
    }>;
  }>;
}

export function createParallelSearchClient(
  config: { apiKey?: string },
  deps: { client?: ParallelClientLike } = {},
): ParallelSearchClient {
  const client: ParallelClientLike = deps.client ?? new Parallel({ apiKey: config.apiKey });

  return {
    async search({ query }) {
      const response = await client.search({ search_queries: [query] });
      return response.results.map((r) => ({
        url: r.url,
        title: r.title ?? '',
        snippet: r.excerpts.join(' '),
        publishedDate: r.publish_date ?? null,
      }));
    },
  };
}
