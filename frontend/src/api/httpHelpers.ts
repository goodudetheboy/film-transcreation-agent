/** Shared by projectsApiClient.ts and filmsApiClient.ts — both throw on a non-ok
 * response rather than emitting an error-shaped event (unlike apiClient.ts's SSE
 * endpoints, which have a different error-reporting convention). */
export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function resolveBaseUrl(options: ApiClientOptions): string {
  return options.baseUrl ?? (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';
}

export async function describeError(res: Response): Promise<string> {
  let detail = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        detail = typeof parsed.error === 'string' ? parsed.error : text;
      } catch {
        detail = text;
      }
    }
  } catch {
    // response body unreadable — fall back to a status-only message
  }
  return detail;
}

export async function throwOnError(res: Response): Promise<void> {
  if (!res.ok) {
    const detail = await describeError(res);
    throw new Error(`request failed with status ${res.status}${detail ? `: ${detail}` : ''}`);
  }
}
