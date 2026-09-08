import type { DiscoveryAgentSession, DiscoveryChatStreamEvent } from './apiClient.types';
import { parseSSEStream } from './sseStream';
import { resolveBaseUrl, describeError, throwOnError, authHeaders, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

export async function createDiscoveryAgentSession(
  filmId: string,
  payload: { name?: string },
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export async function listDiscoveryAgentSessions(
  filmId: string,
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession[];
}

export async function getDiscoveryAgentSession(
  filmId: string,
  agentId: string,
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}`,
    { headers: await authHeaders() },
  );
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export async function renameDiscoveryAgentSession(
  filmId: string,
  agentId: string,
  payload: { name: string },
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export async function deleteDiscoveryAgentSession(
  filmId: string,
  agentId: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  await throwOnError(res);
}

/** Records that a pass (DiscoveryJob) was kicked off from this agent's
 * thread — the job itself is created via filmsApiClient's createDiscoveryJob
 * (unchanged); this just files a `run` reference turn so it renders inline
 * in the conversation. */
export async function logDiscoveryRun(
  filmId: string,
  agentId: string,
  payload: { jobId: string },
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export interface SendDiscoveryChatMessagePayload {
  text: string;
  testMode: boolean;
}

/** Sends one chat message and streams the live tool-calling turn — text_delta/
 * tool_call/tool_result/row_patched/row_added/row_discarded/turn_done, ending
 * on turn_done or error. */
export async function sendDiscoveryChatMessage(
  filmId: string,
  agentId: string,
  payload: SendDiscoveryChatMessagePayload,
  onEvent: (event: DiscoveryChatStreamEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch (err) {
    // A user-initiated Stop click aborts this fetch — that's not a failure, so stay
    // quiet rather than surfacing an error banner. Anything else really did fail.
    if (err instanceof Error && err.name === 'AbortError') return;
    throw err;
  }

  if (!res.ok) {
    const detail = await describeError(res);
    onEvent({ type: 'error', message: `request failed with status ${res.status}${detail ? `: ${detail}` : ''}` });
    return;
  }
  if (!res.body) {
    onEvent({ type: 'error', message: `request failed with status ${res.status}` });
    return;
  }

  try {
    await parseSSEStream<DiscoveryChatStreamEvent>(
      res,
      onEvent,
      (event) => event.type === 'turn_done' || event.type === 'stopped' || event.type === 'error',
    );
  } catch (err) {
    // The Stop button aborting mid-stream tears down the read here too — same
    // quiet handling as the initial fetch above.
    if (err instanceof Error && err.name === 'AbortError') return;
    throw err;
  }
}
