/** Extracted from apiClient.ts's original streamAnalyze loop — the frame-reassembly
 * logic is shared verbatim by every SSE endpoint, only the response/event types differ.
 * See docs/adr/0009 for why this is fetch+ReadableStream, not EventSource. */
export async function parseSSEStream<TEvent extends { type: string }>(
  res: Response,
  onEvent: (event: TEvent) => void,
  isTerminal: (event: TEvent) => boolean,
): Promise<void> {
  if (!res.body) {
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
        const event = JSON.parse(dataLine.slice('data: '.length)) as TEvent;
        onEvent(event);
        if (isTerminal(event)) {
          return;
        }
      }

      frameEnd = buffer.indexOf('\n\n');
    }
  }
}
