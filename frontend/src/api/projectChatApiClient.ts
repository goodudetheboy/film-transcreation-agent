import type { ChatStreamEvent } from './apiClient.types';
import { parseSSEStream } from './sseStream';
import { resolveBaseUrl, describeError, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

export interface SendChatMessagePayload {
  passcode: string;
  text: string;
  testMode: boolean;
  /** Which item's detail panel this message was sent from, if any — see docs/adr/0025
   * for why the tool-calling agent needs this even though chat is project-scoped. */
  itemId?: string;
}

/** Sends one chat message and streams the live tool-calling turn — text_delta/
 * tool_call/tool_result/item_patched/turn_done, ending on turn_done or error. */
export async function sendChatMessage(
  projectId: string,
  sessionId: string,
  payload: SendChatMessagePayload,
  onEvent: (event: ChatStreamEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/api/projects/${projectId}/chat-sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    await parseSSEStream<ChatStreamEvent>(
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
