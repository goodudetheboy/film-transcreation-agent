import { resolveBaseUrl, throwOnError, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

/** Deliberately unauthenticated — no authHeaders() call, see backend's
 * routes/demoSession.ts. Returns a Firebase custom token for the one
 * pre-provisioned demo account; the caller signs in with it via
 * signInWithCustomToken. See docs/adr/0030. */
export async function fetchDemoSessionToken(options: ApiClientOptions = {}): Promise<string> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(`${baseUrl}/api/demo-session`, { method: 'POST', signal: options.signal });
  await throwOnError(res);
  const body = (await res.json()) as { token: string };
  return body.token;
}
