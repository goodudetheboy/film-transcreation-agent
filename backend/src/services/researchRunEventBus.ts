import { EventEmitter } from 'node:events';

/**
 * Bridges research-run/chat-session progress (which mutate Firestore) to SSE
 * route handlers (which need live push, not polling) — copy of
 * discoveryEventBus.ts's pattern verbatim, see docs/adr/0020. Only correct
 * with a single backend process, same caveat as discoveryEventBus.ts.
 */
export interface ResearchRunEventBus {
  publish(channelId: string, event: unknown): void;
  subscribe(channelId: string, onEvent: (event: unknown) => void): () => void;
}

export function createResearchRunEventBus(): ResearchRunEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(200);

  return {
    publish(channelId, event) {
      emitter.emit(channelId, event);
    },
    subscribe(channelId, onEvent) {
      emitter.on(channelId, onEvent);
      return () => emitter.off(channelId, onEvent);
    },
  };
}
