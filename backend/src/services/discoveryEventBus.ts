import { EventEmitter } from 'node:events';

/**
 * Bridges the in-process discovery queue worker / prep pipeline (which mutate
 * Firestore) to SSE route handlers (which need live push, not polling) — see
 * docs/adr/0020. Only correct with a single backend process: an SSE client on
 * one Cloud Run instance wouldn't hear a job processed on another. Acceptable
 * at this app's hackathon scope (min/max instances effectively 1); a real
 * multi-instance deployment would need a shared pub/sub layer instead.
 */
export interface DiscoveryEventBus {
  publish(channelId: string, event: unknown): void;
  subscribe(channelId: string, onEvent: (event: unknown) => void): () => void;
}

export function createDiscoveryEventBus(): DiscoveryEventBus {
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
