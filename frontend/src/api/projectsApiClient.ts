import type { Project, ResearchStreamEvent, Rubric } from './apiClient.types';
import { parseSSEStream } from './sseStream';

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function resolveBaseUrl(options: ApiClientOptions): string {
  return options.baseUrl ?? (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';
}

async function describeError(res: Response): Promise<string> {
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

async function throwOnError(res: Response): Promise<void> {
  if (!res.ok) {
    const detail = await describeError(res);
    throw new Error(`request failed with status ${res.status}${detail ? `: ${detail}` : ''}`);
  }
}

export interface CreateProjectPayload {
  passcode: string;
  country: string;
  items: Array<{ scriptLine: string; sceneDescription: string }>;
  rubrics?: Rubric[];
}

export async function createProject(
  payload: CreateProjectPayload,
  options: ApiClientOptions = {},
): Promise<Project> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Project;
}

export async function listProjects(
  passcode: string,
  options: ApiClientOptions = {},
): Promise<Project[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as Project[];
}

export async function getProject(
  id: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<Project> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/projects/${id}?passcode=${encodeURIComponent(passcode)}`,
  );
  await throwOnError(res);
  return (await res.json()) as Project;
}

export interface StreamResearchPayload {
  passcode: string;
  testMode: boolean;
}

export async function streamResearch(
  projectId: string,
  payload: StreamResearchPayload,
  onEvent: (event: ResearchStreamEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await describeError(res);
    onEvent({
      type: 'error',
      message: `request failed with status ${res.status}${detail ? `: ${detail}` : ''}`,
    });
    return;
  }

  if (!res.body) {
    onEvent({ type: 'error', message: `request failed with status ${res.status}` });
    return;
  }

  await parseSSEStream<ResearchStreamEvent>(res, onEvent, (event) => event.type === 'done');
}
