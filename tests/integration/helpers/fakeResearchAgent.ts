import { vi } from 'vitest';
import type { ResearchAgent, ResearchResult } from '../../../backend/src/services/researchAgent';

/** A canned result shape with a placeholder itemId — the real item id (assigned
 * by the caller at creation time, unknown to this fixture) is substituted in by
 * index when the fake actually runs, so `applyResearchResult` writes land on the
 * real ProjectItem the backend created, not a fake id. */
export type CannedResearchResult = Omit<ResearchResult, 'itemId'>;

/** The ONLY thing allowed to be fake in this test layer — see docs/adr/0002/0012/0013 and CLAUDE.md. */
export function fakeResearchAgent(resultsByBatch: CannedResearchResult[][] = [[]]): ResearchAgent {
  return {
    researchBatch: vi.fn(async ({ items, onBatchComplete }) => {
      const all: ResearchResult[] = [];
      let cursor = 0;
      for (let i = 0; i < resultsByBatch.length; i++) {
        const batchResults: ResearchResult[] = resultsByBatch[i].map((r) => ({ ...r, itemId: items[cursor++]?.id ?? 'unknown' }));
        all.push(...batchResults);
        await onBatchComplete?.({
          batchIndex: i,
          totalBatches: resultsByBatch.length,
          itemIds: batchResults.map((r) => r.itemId),
          results: batchResults,
        });
      }
      return all;
    }),
  };
}
