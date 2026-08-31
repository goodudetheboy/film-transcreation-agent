import type {
  ChatSession,
  EnrichedProject,
  Project,
  ProjectItem,
  ProjectItemAction,
  ResearchRun,
  ResearchRunStreamEvent,
  ResearchRunUpdateEvent,
  Rubric,
} from './apiClient.types';
import { parseSSEStream } from './sseStream';
import { resolveBaseUrl, describeError, throwOnError, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

// ---- Projects ---------------------------------------------------------------

export async function listProjects(passcode: string, options: ApiClientOptions = {}): Promise<EnrichedProject[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as EnrichedProject[];
}

export async function getProject(id: string, passcode: string, options: ApiClientOptions = {}): Promise<EnrichedProject> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${id}?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as EnrichedProject;
}

export async function updateProject(
  id: string,
  payload: { passcode: string; name?: string; note?: string; status?: Project['status'] },
  options: ApiClientOptions = {},
): Promise<Project> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Project;
}

// ---- Rubrics ------------------------------------------------------------

export async function listRubrics(projectId: string, passcode: string, options: ApiClientOptions = {}): Promise<Rubric[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/rubrics?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as Rubric[];
}

export async function createRubric(
  projectId: string,
  payload: { passcode: string; name: string; description: string; weight: number; trendEligible?: boolean },
  options: ApiClientOptions = {},
): Promise<Rubric> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/rubrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Rubric;
}

export async function updateRubric(
  projectId: string,
  rubricId: string,
  payload: { passcode: string; name?: string; description?: string; weight?: number; trendEligible?: boolean },
  options: ApiClientOptions = {},
): Promise<Rubric> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/rubrics/${rubricId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Rubric;
}

export async function deleteRubric(
  projectId: string,
  rubricId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/rubrics/${rubricId}?passcode=${encodeURIComponent(passcode)}`,
    { method: 'DELETE' },
  );
  await throwOnError(res);
}

// ---- Items ------------------------------------------------------------

export async function listItems(projectId: string, passcode: string, options: ApiClientOptions = {}): Promise<ProjectItem[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as ProjectItem[];
}

export async function addItems(
  projectId: string,
  payload: { passcode: string; detailRowIds: string[] },
  options: ApiClientOptions = {},
): Promise<ProjectItem[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem[];
}

export async function updateItemAction(
  projectId: string,
  itemId: string,
  payload: { passcode: string; action: ProjectItemAction },
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem;
}

export async function deleteItem(
  projectId: string,
  itemId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/items/${itemId}?passcode=${encodeURIComponent(passcode)}`,
    { method: 'DELETE' },
  );
  await throwOnError(res);
}

export async function updateItemScore(
  projectId: string,
  itemId: string,
  rubricId: string,
  payload: { passcode: string; score?: number; reasoning?: string; evidence?: string; userNote?: string },
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items/${itemId}/scores/${rubricId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem;
}

// ---- Research runs ------------------------------------------------------

export async function listResearchRuns(
  projectId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<ResearchRun[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/research-runs?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as ResearchRun[];
}

export interface StreamResearchRunPayload {
  passcode: string;
  testMode: boolean;
  mode: 'need-research' | 'custom';
  itemIds?: string[];
}

/** Kicks off a research run and streams its progress directly — the rich
 * per-batch-results event shape. See docs/adr/0025 for why this coexists with
 * the separate resumable stream() below. */
export async function streamResearchRun(
  projectId: string,
  payload: StreamResearchRunPayload,
  onEvent: (event: ResearchRunStreamEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/research-runs`, {
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

  await parseSSEStream<ResearchRunStreamEvent>(res, onEvent, (event) => event.type === 'done' || event.type === 'error');
}

/** Resumable — replays the run's current full state, then follows live until terminal.
 * Use to reconnect to a run kicked off elsewhere/earlier (e.g. after a page reload). */
export async function streamResearchRunUpdates(
  projectId: string,
  runId: string,
  passcode: string,
  onEvent: (event: ResearchRunUpdateEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/research-runs/${runId}/stream?passcode=${encodeURIComponent(passcode)}`,
  );
  if (!res.ok || !res.body) return;
  await parseSSEStream<ResearchRunUpdateEvent>(res, onEvent, (event) => event.run.status === 'done' || event.run.status === 'error');
}

// ---- Chat sessions ------------------------------------------------------

export async function createChatSession(
  projectId: string,
  payload: { passcode: string; name?: string },
  options: ApiClientOptions = {},
): Promise<ChatSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ChatSession;
}

export async function listChatSessions(
  projectId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<ChatSession[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as ChatSession[];
}

export async function getChatSession(
  projectId: string,
  sessionId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<ChatSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/chat-sessions/${sessionId}?passcode=${encodeURIComponent(passcode)}`,
  );
  await throwOnError(res);
  return (await res.json()) as ChatSession;
}
