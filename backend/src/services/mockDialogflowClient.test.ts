import { describe, it, expect } from 'vitest';
import { createMockDialogflowClient } from './mockDialogflowClient.js';

describe('createMockDialogflowClient', () => {
  it('returns a non-empty array of flagged lines shaped like the real client', async () => {
    const client = createMockDialogflowClient();
    const result = await client.analyzeScript({ script: 'anything', country: 'anywhere' });
    expect(result.length).toBeGreaterThan(0);
    for (const line of result) {
      expect(typeof line.line).toBe('string');
      expect(typeof line.reason).toBe('string');
      expect(typeof line.suggestedReplacement).toBe('string');
    }
  });

  it('returns the same canned data regardless of input, so demos are reproducible', async () => {
    const client = createMockDialogflowClient();
    const a = await client.analyzeScript({ script: 'one', country: 'Japan' });
    const b = await client.analyzeScript({ script: 'two', country: 'Brazil' });
    expect(a).toEqual(b);
  });
});
