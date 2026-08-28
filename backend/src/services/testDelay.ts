export interface DelayRange {
  minMs: number;
  maxMs: number;
}

/**
 * Every mock in this app (upload, subtitle parse, discovery pass) simulates a
 * realistic wait instead of resolving instantly, so the state-driven prep/agent
 * UI is actually exercisable and demoable without hitting a paid API. `scale`
 * is the one knob (config.mockDelayScale / MOCK_DELAY_SCALE) to speed this up
 * for local iteration without touching every mock's own numbers.
 */
export function simulateDelay(range: DelayRange, scale = 1): Promise<void> {
  const ms = (range.minMs + Math.random() * (range.maxMs - range.minMs)) * scale;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
