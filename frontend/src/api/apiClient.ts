import type { AgentEvent, GestureLog } from './apiClient.types';
import { parseSSEStream } from './sseStream';

export interface StreamAnalyzePayload {
  script: string;
  targetCountry: string;
  passcode: string;
  /** When true (or omitted server-side), the backend returns mock data instead of calling Dialogflow CX. */
  testMode: boolean;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function resolveBaseUrl(options: ApiClientOptions): string {
  return options.baseUrl ?? (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';
}

/** Extracts a human-readable detail from a non-ok response body, if any. */
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

export async function streamAnalyze(
  payload: StreamAnalyzePayload,
  onEvent: (event: AgentEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/analyze`, {
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

  await parseSSEStream<AgentEvent>(res, onEvent, (event) => event.type === 'done');
}

export interface VerifyPasscodeResult {
  ok: boolean;
  message?: string;
}

/** Lets the passcode gate confirm correctness before showing the main UI. */
export async function verifyPasscode(
  passcode: string,
  options: ApiClientOptions = {},
): Promise<VerifyPasscodeResult> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/verify-passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });

  if (res.ok) {
    return { ok: true };
  }

  const detail = await describeError(res);
  return { ok: false, message: detail || `request failed with status ${res.status}` };
}

export interface PreprocessVideoPayload {
  videoUrl: string;
  passcode: string;
  /** When true (or omitted server-side), the backend returns mock data instead of calling Gemini. */
  testMode: boolean;
}

export type PreprocessVideoResult =
  | { ok: true; lines: GestureLog[] }
  | { ok: false; message: string };

export async function preprocessVideo(
  payload: PreprocessVideoPayload,
  options: ApiClientOptions = {},
): Promise<PreprocessVideoResult> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/preprocess-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await describeError(res);
    return { ok: false, message: detail || `request failed with status ${res.status}` };
  }

  const body = JSON.parse(await res.text()) as { lines: GestureLog[] };
  return { ok: true, lines: body.lines };
}
