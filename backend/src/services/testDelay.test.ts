import { describe, it, expect } from 'vitest';
import { simulateDelay } from './testDelay.js';

describe('simulateDelay', () => {
  it('resolves after at least the minimum of the range, scaled', async () => {
    const start = Date.now();
    await simulateDelay({ minMs: 40, maxMs: 60 }, 1);
    expect(Date.now() - start).toBeGreaterThanOrEqual(35); // small tolerance for timer jitter
  });

  it('scale shrinks the wait proportionally', async () => {
    const start = Date.now();
    await simulateDelay({ minMs: 200, maxMs: 200 }, 0.1);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
