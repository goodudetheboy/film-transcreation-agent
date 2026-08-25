import { describe, it, expect } from 'vitest';
import { createMockResearchAgent } from './mockResearchAgent.js';

describe('createMockResearchAgent', () => {
  it('returns one result per item, deterministic regardless of rubrics passed in', async () => {
    const agent = createMockResearchAgent();
    const items = [
      { id: 'a', scriptLine: 'hello', sceneDescription: 'a quiet room' },
      { id: 'b', scriptLine: 'bye', sceneDescription: 'a busy street' },
    ];

    const result = await agent.researchBatch({
      items,
      targetCountry: 'Japan',
      rubrics: [{ id: 'r1', description: 'anything' }],
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.itemId)).toEqual(['a', 'b']);
    expect(result.every((r) => r.targetCountry === 'Japan')).toBe(true);
  });

  it('returns an empty findings array when no rubric-relevant content is present', async () => {
    const agent = createMockResearchAgent();
    const result = await agent.researchBatch({
      items: [{ id: 'a', scriptLine: 'hello', sceneDescription: 'a quiet room' }],
      targetCountry: 'Brazil',
      rubrics: [],
    });

    expect(result[0].findings).toEqual([]);
  });

  it('detects "broccoli" in sceneDescription and returns the canned Inside Out finding', async () => {
    const agent = createMockResearchAgent();
    const result = await agent.researchBatch({
      items: [
        {
          id: 'a',
          scriptLine: "I'm not eating that broccoli.",
          sceneDescription: 'Riley pushes a plate of broccoli away',
        },
      ],
      targetCountry: 'Japan',
      rubrics: [{ id: 'food-aversion', description: 'food that reads differently abroad' }],
    });

    expect(result[0].findings).toHaveLength(1);
    expect(result[0].findings[0].rubricId).toBe('food-aversion');
    expect(result[0].findings[0].sources.length).toBeGreaterThan(0);
  });

  it('fires onBatchComplete per batch, same as the real agent, so callers can rely on the contract', async () => {
    const agent = createMockResearchAgent();
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `item-${i}`,
      scriptLine: `line ${i}`,
      sceneDescription: `scene ${i}`,
    }));
    const progress: Array<{ batchIndex: number; totalBatches: number; itemIds: string[] }> = [];

    await agent.researchBatch({
      items,
      targetCountry: 'Japan',
      rubrics: [],
      onBatchComplete: (p) => progress.push(p),
    });

    expect(progress).toHaveLength(2); // 10 + 2
    expect(progress[0]).toMatchObject({ batchIndex: 0, totalBatches: 2 });
    expect(progress[0].itemIds).toHaveLength(10);
    expect(progress[1]).toMatchObject({ batchIndex: 1, totalBatches: 2 });
    expect(progress[1].itemIds).toHaveLength(2);
  });
});
