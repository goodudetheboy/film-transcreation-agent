import { describe, it, expect } from 'vitest';
import { createMockCaptioningClient } from './mockCaptioningClient.js';

describe('createMockCaptioningClient', () => {
  it('returns a non-empty array of gesture logs shaped like the real client', async () => {
    const client = createMockCaptioningClient();
    const result = await client.preprocessVideo({ videoUrl: 'gs://anything/anything.mp4' });
    expect(result.length).toBeGreaterThan(0);
    for (const gesture of result) {
      expect(typeof gesture.timecode).toBe('string');
      expect(typeof gesture.gesture).toBe('string');
      expect(typeof gesture.character).toBe('string');
      expect(typeof gesture.narrativeLoad).toBe('string');
      expect(typeof gesture.backgroundNote).toBe('string');
    }
  });

  it('returns the same canned data regardless of input, so demos are reproducible', async () => {
    const client = createMockCaptioningClient();
    const a = await client.preprocessVideo({ videoUrl: 'gs://one/one.mp4' });
    const b = await client.preprocessVideo({ videoUrl: 'gs://two/two.mp4' });
    expect(a).toEqual(b);
  });
});
