import { describe, it, expect } from 'vitest';
import { createMockCaptioningClient } from './mockCaptioningClient.js';

describe('createMockCaptioningClient', () => {
  it('returns non-empty dialogue and gesture arrays shaped like the real client', async () => {
    const client = createMockCaptioningClient();
    const result = await client.preprocessVideo({ videoUrl: 'gs://anything/anything.mp4' });

    expect(result.dialogue.length).toBeGreaterThan(0);
    for (const line of result.dialogue) {
      expect(typeof line.timecode).toBe('string');
      expect(typeof line.character).toBe('string');
      expect(typeof line.text).toBe('string');
    }

    expect(result.gestures.length).toBeGreaterThan(0);
    for (const gesture of result.gestures) {
      expect(typeof gesture.timecode).toBe('string');
      expect(typeof gesture.character).toBe('string');
      expect(typeof gesture.gesture).toBe('string');
      expect(typeof gesture.expression).toBe('string');
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
