import type { DiscoveryAgentSession, DiscoveryChatStreamEvent } from './apiClient.types';
import { parseSSEStream } from './sseStream';
import { resolveBaseUrl, describeError, throwOnError, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

export async function createDiscoveryAgentSession(
  filmId: string,
  payload: { passcode: string; name?: string },
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export async function listDiscoveryAgentSessions(
  filmId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession[];
}

export async function getDiscoveryAgentSession(
  filmId: string,
  agentId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}?passcode=${encodeURIComponent(passcode)}`,
  );
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export async function deleteDiscoveryAgentSession(
  filmId: string,
  agentId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}?passcode=${encodeURIComponent(passcode)}`,
    { method: 'DELETE' },
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
  payload: { passcode: string; jobId: string },
  options: ApiClientOptions = {},
): Promise<DiscoveryAgentSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryAgentSession;
}

export interface SendDiscoveryChatMessagePayload {
  passcode: string;
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

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-agents/${agentId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await describeError(res);
    onEvent({ type: 'error', message: `request failed with status ${res.status}${detail ? `: ${detail}` : ''}` });
    return;
  }
  if (!res.body) {
    onEvent({ type: 'error', message: `request failed with status ${res.status}` });
    return;
  }

  await parseSSEStream<DiscoveryChatStreamEvent>(res, onEvent, (event) => event.type === 'turn_done' || event.type === 'error');
}
