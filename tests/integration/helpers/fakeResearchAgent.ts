import { vi } from 'vitest';
import type { ResearchAgent, ResearchResult } from '../../../backend/src/services/researchAgent';

/** The ONLY thing allowed to be fake in this test layer — see docs/adr/0002/0012/0013 and CLAUDE.md. */
export function fakeResearchAgent(resultsByBatch: ResearchResult[][] = [[]]): ResearchAgent {
  return {
    researchBatch: vi.fn(async ({ items, onBatchComplete }) => {
      const all: ResearchResult[] = [];
      for (let i = 0; i < resultsByBatch.length; i++) {
        const batchResults = resultsByBatch[i];
        all.push(...batchResults);
        onBatchComplete?.({
          batchIndex: i,
          totalBatches: resultsByBatch.length,
          itemIds: items.map((it) => it.id),
          results: batchResults,
        });
      }
      return all;
    }),
  };
}
