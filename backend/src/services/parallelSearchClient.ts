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
  // Constructed lazily (on first real search), not here: the Parallel SDK's
  // constructor throws synchronously when no API key is configured, and this
  // factory runs eagerly at server startup even when testMode/mock keeps the
  // real client from ever being called — a missing key must only fail an
  // actual search, not crash the whole process before it can bind its port.
  let client: ParallelClientLike | undefined = deps.client;
  function getClient(): ParallelClientLike {
    if (!client) client = new Parallel({ apiKey: config.apiKey });
    return client;
  }

  return {
    async search({ query }) {
      const response = await getClient().search({ search_queries: [query] });
      return response.results.map((r) => ({
        url: r.url,
        title: r.title ?? '',
        snippet: r.excerpts.join(' '),
        publishedDate: r.publish_date ?? null,
      }));
    },
  };
}
