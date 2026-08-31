import { describe, it, expect } from 'vitest';
import { createMockResearchAgent } from './mockResearchAgent.js';
import type { Rubric } from './researchAgent.js';

const NOW = new Date().toISOString();
function rubric(id: string, description: string, weight = 3, opts: { name?: string; trendEligible?: boolean } = {}): Rubric {
  return {
    id,
    projectId: 'proj-a',
    name: opts.name ?? id,
    description,
    weight,
    trendEligible: opts.trendEligible ?? false,
    createdAt: NOW,
    updatedAt: NOW,
  };
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

  it('still detects "broccoli" when the food-aversion rubric has a real server-assigned id, matching by name not a hardcoded id string', async () => {
    // Regression test: real rubrics get a randomUUID() id (projectRubricStore.ts),
    // never the literal string "food-aversion" — a mock that only matches that
    // exact id would never fire through the real app, only in tests that happen
    // to hand-construct a rubric with that id.
    const agent = createMockResearchAgent();
    const realisticRubrics = [
      rubric('a1b2c3d4-food', 'A food or drink reference that reads differently.', 3, { name: 'Food aversion' }),
      rubric('e5f6g7h8-word', 'wordplay that depends on the source language', 3, { name: 'Wordplay' }),
    ];

    const result = await agent.researchBatch({
      items: [
        {
          id: 'a',
          scriptLine: "I'm not eating that broccoli.",
          sceneDescription: 'Riley pushes a plate of broccoli away',
        },
      ],
      targetCountry: 'Japan',
      rubrics: realisticRubrics,
    });

    const foodScore = result[0].scores.find((s) => s.rubricId === 'a1b2c3d4-food');
    expect(foodScore?.score).toBeGreaterThanOrEqual(7);
    expect(result[0].shouldTranscreate).toBe(true);
    expect(result[0].suggestedReplacement?.text.length).toBeGreaterThan(0);
  });

  it('detects "meme" and scores a trendEligible rubric high (by the flag, not a hardcoded id), recommending transcreation', async () => {
    const agent = createMockResearchAgent();
    const realisticRubrics = [
      rubric('a1b2c3d4-food', 'A food or drink reference that reads differently.', 3, { name: 'Food aversion' }),
      rubric('i9j0k1l2-slang', 'Slang or memes tied to a moment.', 3, { name: 'Slang / meme reference', trendEligible: true }),
    ];

    const result = await agent.researchBatch({
      items: [
        {
          id: 'a',
          scriptLine: "That's such an old meme, nobody says that anymore.",
          sceneDescription: 'A character references a dated meme',
        },
      ],
      targetCountry: 'Brazil',
      rubrics: realisticRubrics,
    });

    const slangScore = result[0].scores.find((s) => s.rubricId === 'i9j0k1l2-slang');
    const foodScore = result[0].scores.find((s) => s.rubricId === 'a1b2c3d4-food');
    expect(slangScore?.score).toBeGreaterThanOrEqual(7);
    expect(foodScore?.score).toBeLessThan(7);
    expect(result[0].shouldTranscreate).toBe(true);
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
