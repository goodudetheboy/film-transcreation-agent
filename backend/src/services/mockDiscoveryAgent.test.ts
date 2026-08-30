import { describe, it, expect } from 'vitest';
import { createMockDiscoveryAgent } from './mockDiscoveryAgent.js';
import type { SubtitleEntry } from './filmTypes.js';

const CONFIG = { mockDelayScale: 0.001 };

describe('createMockDiscoveryAgent runPass', () => {
  it('proposes one freeform, non-dialogue-anchored row alongside the dialogue-anchored ones', async () => {
    const entries: SubtitleEntry[] = [
      { id: 'e1', index: 0, startMs: 1000, endMs: 2000, text: 'Hello there' },
      { id: 'e2', index: 1, startMs: 5000, endMs: 6000, text: 'Second line' },
    ];
    const agent = createMockDiscoveryAgent(CONFIG);
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: entries,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      priorConversation: [],
    });

    expect(result.resultRows).toHaveLength(3);
    // The two dialogue-anchored rows keep their entry's exact boundaries and text.
    expect(result.resultRows[0]).toMatchObject({ startMs: 1000, endMs: 2000, subtitleText: 'Hello there' });
    expect(result.resultRows[1]).toMatchObject({ startMs: 5000, endMs: 6000, subtitleText: 'Second line' });
    // The third demonstrates docs/adr/0023: no subtitle line under it at all.
    const freeform = result.resultRows[2];
    expect(freeform.subtitleText).toBe('');
    expect(freeform.startMs).toBe(2000);
    expect(freeform.endMs).toBeGreaterThan(freeform.startMs);
    expect(freeform.endMs).toBeLessThanOrEqual(5000); // falls in the gap, doesn't overlap the second line
  });

  it('synthesizes a freeform row even when there is no gap to place it in', async () => {
    const entries: SubtitleEntry[] = [{ id: 'e1', index: 0, startMs: 1000, endMs: 2000, text: 'Only line' }];
    const agent = createMockDiscoveryAgent(CONFIG);
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: entries,
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      priorConversation: [],
    });

    expect(result.resultRows).toHaveLength(2);
    expect(result.resultRows[1]).toMatchObject({ startMs: 2000, endMs: 3500, subtitleText: '' });
  });

  it('returns no rows when there are no subtitle entries at all', async () => {
    const agent = createMockDiscoveryAgent(CONFIG);
    const result = await agent.runPass({
      videoUrl: 'gs://bucket/clip.mp4',
      subtitleEntries: [],
      specialInstruction: '',
      targetColumns: ['segmentDescription'],
      priorConversation: [],
    });
    expect(result.resultRows).toHaveLength(0);
  });
});
