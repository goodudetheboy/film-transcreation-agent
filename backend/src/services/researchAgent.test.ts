import { describe, it, expect, vi } from 'vitest';
import { createResearchAgent, stripJsonFences, type GenAIClient, type Rubric } from './researchAgent.js';

const CONFIG = {
  googleCloudProject: 'test-project',
  geminiLocation: 'us-central1',
  geminiModel: 'gemini-2.5-flash',
};

const NOW = new Date().toISOString();
function rubric(id: string, description: string, weight = 3): Rubric {
  return { id, projectId: 'proj-a', name: id, description, weight, trendEligible: false, createdAt: NOW, updatedAt: NOW };
}

function fakeGenAI(generateContent: GenAIClient['models']['generateContent']): GenAIClient {
  return { models: { generateContent } };
}

function itemsList(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    scriptLine: `line ${i}`,
    sceneDescription: `scene ${i}`,
  }));
}

function resultsFor(ids: string[]) {
  return JSON.stringify(
    ids.map((id) => ({
      item_id: id,
      target_country: 'Japan',
      scores: [],
      summary: 'no concerns',
      should_transcreate: false,
    })),
  );
}

/** Pulls the JSON payload back out of a prompt built by buildPrompt(), so tests can
 * assert on exactly which items a given call was sent. */
function itemIdsFromPrompt(contents: string): string[] {
  const input = contents.slice(contents.indexOf('INPUT\n') + 'INPUT\n'.length, contents.indexOf('\n\nTASK'));
  const payload = JSON.parse(input);
  return payload.items.map((i: { id: string }) => i.id);
}

describe('stripJsonFences', () => {
  it('returns plain JSON text unchanged', () => {
    expect(stripJsonFences('[]')).toBe('[]');
  });

  it('strips ```json fences', () => {
    expect(stripJsonFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it('strips plain ``` fences without a language tag', () => {
    expect(stripJsonFences('```\n[]\n```')).toBe('[]');
  });
});

describe('createResearchAgent researchBatch', () => {
  it('chunks more than 10 items into multiple calls of at most 10 each', async () => {
    const calls: unknown[] = [];
    const generateContent = vi.fn(async (params: any) => {
      calls.push(params);
      const ids = itemIdsFromPrompt(params.contents);
      return { text: resultsFor(ids) };
    });

    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const items = itemsList(25);
    const results = await agent.researchBatch({
      items,
      targetCountry: 'Japan',
      rubrics: [rubric('r1', 'test rubric')],
    });

    expect(generateContent).toHaveBeenCalledTimes(3); // 10 + 10 + 5
    expect(results).toHaveLength(25);
    expect(results.map((r) => r.itemId)).toEqual(items.map((i) => i.id));
  });

  it('calls are sequential, not concurrent', async () => {
    const order: string[] = [];
    const generateContent = vi.fn(async (params: any) => {
      const ids = itemIdsFromPrompt(params.contents);
      const firstId = ids[0] ?? 'unknown';
      order.push(`start-${firstId}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end-${firstId}`);
      return { text: resultsFor(ids) };
    });

    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    await agent.researchBatch({
      items: itemsList(15),
      targetCountry: 'Japan',
      rubrics: [],
    });

    expect(order).toEqual(['start-item-0', 'end-item-0', 'start-item-10', 'end-item-10']);
  });

  it('strips markdown fences from the response before parsing', async () => {
    const generateContent = vi.fn(async () => ({
      text: '```json\n' + resultsFor(['item-0']) + '\n```',
    }));
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });

    const results = await agent.researchBatch({
      items: itemsList(1),
      targetCountry: 'Japan',
      rubrics: [],
    });

    expect(results).toEqual([
      { itemId: 'item-0', targetCountry: 'Japan', scores: [], summary: 'no concerns', shouldTranscreate: false },
    ]);
  });

  it('throws a clear error, including the raw text, on invalid JSON', async () => {
    const generateContent = vi.fn(async () => ({ text: 'not json at all' }));
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });

    await expect(
      agent.researchBatch({ items: itemsList(1), targetCountry: 'Japan', rubrics: [] }),
    ).rejects.toThrow(/not json at all/);
  });

  it('throws on an empty response', async () => {
    const generateContent = vi.fn(async () => ({ text: undefined }));
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });

    await expect(
      agent.researchBatch({ items: itemsList(1), targetCountry: 'Japan', rubrics: [] }),
    ).rejects.toThrow(/empty response/);
  });

  it('awaits an async onBatchComplete before starting the next batch call', async () => {
    const order: string[] = [];
    const generateContent = vi.fn(async (params: any) => {
      const ids = itemIdsFromPrompt(params.contents);
      order.push(`generate-${ids[0]}`);
      return { text: resultsFor(ids) };
    });
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });

    await agent.researchBatch({
      items: itemsList(15),
      targetCountry: 'Japan',
      rubrics: [],
      onBatchComplete: async (p) => {
        order.push(`callback-start-${p.itemIds[0]}`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`callback-end-${p.itemIds[0]}`);
      },
    });

    expect(order).toEqual([
      'generate-item-0',
      'callback-start-item-0',
      'callback-end-item-0',
      'generate-item-10',
      'callback-start-item-10',
      'callback-end-item-10',
    ]);
  });

  it('fires onBatchComplete after each batch with that batch\'s own results', async () => {
    const generateContent = vi.fn(async (params: any) => {
      const ids = itemIdsFromPrompt(params.contents);
      return { text: resultsFor(ids) };
    });
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });
    const progress: Array<{ batchIndex: number; totalBatches: number; itemIds: string[] }> = [];

    await agent.researchBatch({
      items: itemsList(15),
      targetCountry: 'Japan',
      rubrics: [],
      onBatchComplete: (p) => progress.push(p),
    });

    expect(progress).toHaveLength(2);
    expect(progress[0]).toMatchObject({ batchIndex: 0, totalBatches: 2 });
    expect(progress[0].itemIds).toEqual(itemsList(10).map((i) => i.id));
    expect(progress[1]).toMatchObject({ batchIndex: 1, totalBatches: 2 });
    expect(progress[1].itemIds).toEqual(['item-10', 'item-11', 'item-12', 'item-13', 'item-14']);
  });

  it('maps snake_case score fields to camelCase, including a suggested replacement', async () => {
    const generateContent = vi.fn(async () =>
      ({
        text: JSON.stringify([
          {
            item_id: 'item-0',
            target_country: 'Japan',
            scores: [
              {
                rubric_id: 'food-aversion',
                score: 9,
                reasoning: 'reason',
                evidence: 'evidence',
                sources: ['https://example.com'],
              },
            ],
            summary: 'this should change',
            should_transcreate: true,
            suggested_replacement: { text: 'replacement text', justification: 'because' },
          },
        ]),
      }),
    );
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });

    const results = await agent.researchBatch({
      items: itemsList(1),
      targetCountry: 'Japan',
      rubrics: [rubric('food-aversion', 'test')],
    });

    expect(results[0]).toMatchObject({
      itemId: 'item-0',
      targetCountry: 'Japan',
      scores: [
        {
          rubricId: 'food-aversion',
          score: 9,
          reasoning: 'reason',
          evidence: 'evidence',
          sources: ['https://example.com'],
          updatedBy: 'batch-agent',
        },
      ],
      summary: 'this should change',
      shouldTranscreate: true,
      suggestedReplacement: { text: 'replacement text', justification: 'because' },
    });
    expect(results[0].scores[0].updatedAt).toEqual(expect.any(String));
  });

  it('omits suggestedReplacement entirely when suggested_replacement is null', async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify([
        {
          item_id: 'item-0',
          target_country: 'Japan',
          scores: [],
          summary: 'fine as-is',
          should_transcreate: false,
          suggested_replacement: null,
        },
      ]),
    }));
    const agent = createResearchAgent(CONFIG, { genAI: fakeGenAI(generateContent) });

    const results = await agent.researchBatch({
      items: itemsList(1),
      targetCountry: 'Japan',
      rubrics: [],
    });

    expect(results[0]).not.toHaveProperty('suggestedReplacement');
  });
});
