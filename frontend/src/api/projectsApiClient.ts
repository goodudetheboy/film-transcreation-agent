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
import { resolveBaseUrl, describeError, throwOnError, authHeaders, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

// ---- Projects ---------------------------------------------------------------

export async function listProjects(options: ApiClientOptions = {}): Promise<EnrichedProject[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as EnrichedProject[];
}

export async function getProject(id: string, options: ApiClientOptions = {}): Promise<EnrichedProject> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${id}`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as EnrichedProject;
}

export async function updateProject(
  id: string,
  payload: { name?: string; note?: string; status?: Project['status'] },
  options: ApiClientOptions = {},
): Promise<Project> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Project;
}

// ---- Rubrics ------------------------------------------------------------

export interface DefaultRubric {
  name: string;
  description: string;
  weight: number;
  trendEligible: boolean;
}

/** The server's placeholder rubric set (see backend/src/config/defaultRubrics.ts) —
 * a starting point RubricsEditor can offer via "Use default rubrics", not tied to
 * any project. */
export async function getDefaultRubrics(options: ApiClientOptions = {}): Promise<DefaultRubric[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/default-rubrics`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as DefaultRubric[];
}

export async function listRubrics(projectId: string, options: ApiClientOptions = {}): Promise<Rubric[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/rubrics`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as Rubric[];
}

export async function createRubric(
  projectId: string,
  payload: { name: string; description: string; weight: number; trendEligible?: boolean },
  options: ApiClientOptions = {},
): Promise<Rubric> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/rubrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Rubric;
}

export async function updateRubric(
  projectId: string,
  rubricId: string,
  payload: { name?: string; description?: string; weight?: number; trendEligible?: boolean },
  options: ApiClientOptions = {},
): Promise<Rubric> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/rubrics/${rubricId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Rubric;
}

export async function deleteRubric(
  projectId: string,
  rubricId: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/rubrics/${rubricId}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  await throwOnError(res);
}

// ---- Items ------------------------------------------------------------

export async function listItems(projectId: string, options: ApiClientOptions = {}): Promise<ProjectItem[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as ProjectItem[];
}

export async function addItems(
  projectId: string,
  payload: { detailRowIds: string[] },
  options: ApiClientOptions = {},
): Promise<ProjectItem[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem[];
}

/** General item patch — this is a shared workspace, so besides the human's own
 * `action` verdict, the AI-written `summary`/`shouldTranscreate`/`suggestedReplacement`
 * are equally correctable by a human here (same PATCH route, see backend/routes/projects.ts). */
export async function updateItem(
  projectId: string,
  itemId: string,
  payload: {
    action?: ProjectItemAction;
    summary?: string | null;
    shouldTranscreate?: boolean | null;
    suggestedReplacement?: { text: string; justification: string } | null;
  },
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem;
}

export async function updateItemAction(
  projectId: string,
  itemId: string,
  payload: { action: ProjectItemAction },
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  return updateItem(projectId, itemId, payload, options);
}

export async function deleteItem(
  projectId: string,
  itemId: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/items/${itemId}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  await throwOnError(res);
}

export async function updateItemScore(
  projectId: string,
  itemId: string,
  rubricId: string,
  payload: { score?: number; reasoning?: string; evidence?: string; sources?: string[]; userNote?: string },
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items/${itemId}/scores/${rubricId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem;
}

/** Manual, per-item, ungated trigger — unlike a research run, the click itself is
 * the trigger; runs whenever the project has at least one trend-eligible rubric. */
export async function runTrendResearch(
  projectId: string,
  itemId: string,
  payload: { testMode?: boolean },
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/items/${itemId}/trend-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ProjectItem;
}

// ---- Research runs ------------------------------------------------------

export async function listResearchRuns(
  projectId: string,
  options: ApiClientOptions = {},
): Promise<ResearchRun[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/research-runs`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as ResearchRun[];
}

export async function acceptResearchResult(
  projectId: string,
  runId: string,
  itemId: string,
  options: ApiClientOptions = {},
): Promise<ProjectItem> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/research-runs/${runId}/results/${itemId}/accept`,
    { method: 'POST', headers: await authHeaders() },
  );
  await throwOnError(res);
  return (await res.json()) as ProjectItem;
}

export async function discardResearchResult(
  projectId: string,
  runId: string,
  itemId: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/research-runs/${runId}/results/${itemId}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  await throwOnError(res);
}

/** Bulk sibling of acceptResearchResult — one request regardless of selection
 * size, backed by researchResultActions.ts's acceptResearchResults. */
export async function bulkAcceptResearchResults(
  projectId: string,
  runId: string,
  itemIds: string[],
  options: ApiClientOptions = {},
): Promise<ProjectItem[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/research-runs/${runId}/results/bulk-accept`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ itemIds }) },
  );
  await throwOnError(res);
  return (await res.json()) as ProjectItem[];
}

/** Bulk sibling of discardResearchResult — one request regardless of
 * selection size, backed by researchResultActions.ts's discardResearchResults. */
export async function bulkDiscardResearchResults(
  projectId: string,
  runId: string,
  itemIds: string[],
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/research-runs/${runId}/results/bulk-discard`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ itemIds }) },
  );
  await throwOnError(res);
}

export interface StreamResearchRunPayload {
  testMode: boolean;
  mode: 'need-research' | 'custom';
  itemIds?: string[];
  /** Skips the usual accept/discard review step and applies every result
   * straight to its ProjectItem as each batch completes — only meant for
   * the one-time default pass offered at project creation (see
   * NewProjectModal.tsx), which the user explicitly opts into without a
   * per-result review step. Every other kickoff should omit this. */
  autoApply?: boolean;
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
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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
  onEvent: (event: ResearchRunUpdateEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/research-runs/${runId}/stream`,
    { headers: await authHeaders() },
  );
  if (!res.ok || !res.body) return;
  await parseSSEStream<ResearchRunUpdateEvent>(res, onEvent, (event) => event.run.status === 'done' || event.run.status === 'error');
}

// ---- Chat sessions ------------------------------------------------------

export async function createChatSession(
  projectId: string,
  payload: { name?: string },
  options: ApiClientOptions = {},
): Promise<ChatSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ChatSession;
}

export async function listChatSessions(
  projectId: string,
  options: ApiClientOptions = {},
): Promise<ChatSession[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions`, { headers: await authHeaders() });
  await throwOnError(res);
  return (await res.json()) as ChatSession[];
}

/** Records that a bulk research run was kicked off from this chat session's
 * thread — the run itself is created via streamResearchRun (unchanged); this
 * just files a `run` reference turn so it renders inline in the conversation,
 * mirroring discoveryChatApiClient.ts's logDiscoveryRun. */
export async function logResearchRun(
  projectId: string,
  sessionId: string,
  payload: { runId: string },
  options: ApiClientOptions = {},
): Promise<ChatSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions/${sessionId}/research-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ChatSession;
}

export async function renameChatSession(
  projectId: string,
  sessionId: string,
  payload: { name: string },
  options: ApiClientOptions = {},
): Promise<ChatSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ChatSession;
}

export async function deleteChatSession(
  projectId: string,
  sessionId: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/chat-sessions/${sessionId}`,
    { method: 'DELETE', headers: await authHeaders() },
  );
  await throwOnError(res);
}

export async function getChatSession(
  projectId: string,
  sessionId: string,
  options: ApiClientOptions = {},
): Promise<ChatSession> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${projectId}/chat-sessions/${sessionId}`,
    { headers: await authHeaders() },
  );
  await throwOnError(res);
  return (await res.json()) as ChatSession;
}
