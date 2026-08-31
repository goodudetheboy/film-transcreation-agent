import { describe, it, expect } from 'vitest';
import { createMockResearchAgent } from './mockResearchAgent.js';
import type { Rubric } from './researchAgent.js';

const NOW = new Date().toISOString();
function rubric(id: string, description: string, weight = 3): Rubric {
  return { id, projectId: 'proj-a', name: id, description, weight, createdAt: NOW, updatedAt: NOW };
}

const RUBRICS = [
  rubric('food-aversion', 'food that reads differently abroad'),
  rubric('wordplay', 'wordplay that depends on the source language'),
];

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
      rubrics: [rubric('r1', 'anything')],
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.itemId)).toEqual(['a', 'b']);
    expect(result.every((r) => r.targetCountry === 'Japan')).toBe(true);
  });

  it('scores every rubric exhaustively, one entry per rubric, in order', async () => {
    const agent = createMockResearchAgent();
    const result = await agent.researchBatch({
      items: [{ id: 'a', scriptLine: 'hello', sceneDescription: 'a quiet room' }],
      targetCountry: 'Brazil',
      rubrics: RUBRICS,
    });

    expect(result[0].scores).toHaveLength(2);
    expect(result[0].scores.map((s) => s.rubricId)).toEqual(['food-aversion', 'wordplay']);
    expect(result[0].shouldTranscreate).toBe(false);
  });

  it('returns empty scores and shouldTranscreate:false when no rubrics are given', async () => {
    const agent = createMockResearchAgent();
    const result = await agent.researchBatch({
      items: [{ id: 'a', scriptLine: 'hello', sceneDescription: 'a quiet room' }],
      targetCountry: 'Brazil',
      rubrics: [],
    });

    expect(result[0].scores).toEqual([]);
    expect(result[0].shouldTranscreate).toBe(false);
    expect(result[0]).not.toHaveProperty('suggestedReplacement');
  });

  it('detects "broccoli" and scores food-aversion high, recommending transcreation with a suggestion', async () => {
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
      rubrics: RUBRICS,
    });

    const foodScore = result[0].scores.find((s) => s.rubricId === 'food-aversion');
    const wordplayScore = result[0].scores.find((s) => s.rubricId === 'wordplay');
    expect(foodScore?.score).toBeGreaterThanOrEqual(7);
    expect(foodScore?.sources.length).toBeGreaterThan(0);
    expect(wordplayScore?.score).toBeLessThan(7);
    expect(result[0].shouldTranscreate).toBe(true);
    expect(result[0].suggestedReplacement?.text.length).toBeGreaterThan(0);
    expect(result[0].suggestedReplacement?.justification.length).toBeGreaterThan(0);
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
