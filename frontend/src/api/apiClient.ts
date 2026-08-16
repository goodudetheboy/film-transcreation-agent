import type { AgentEvent } from './apiClient.types';

export interface StreamAnalyzePayload {
  script: string;
  targetCountry: string;
  passcode: string;
}

export interface StreamAnalyzeOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function streamAnalyze(
  payload: StreamAnalyzePayload,
  onEvent: (event: AgentEvent) => void,
  options: StreamAnalyzeOptions = {},
): Promise<void> {
  const baseUrl =
    options.baseUrl ?? (import.meta.env.VITE_PROXY_URL as string | undefined) ?? '';
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    onEvent({ type: 'error', message: `request failed with status ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let frameEnd = buffer.indexOf('\n\n');
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);

      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (dataLine) {
        const event = JSON.parse(dataLine.slice('data: '.length)) as AgentEvent;
        onEvent(event);
        if (event.type === 'done') {
          return;
        }
      }

      frameEnd = buffer.indexOf('\n\n');
    }
  }
}
