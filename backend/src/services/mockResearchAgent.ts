import { BATCH_SIZE, chunk } from './researchAgent.js';
import type { ResearchAgent, ResearchItem, ResearchResult, RubricFinding } from './researchAgent.js';

/** Canned food-aversion finding referencing the same documented Inside Out case used
 * by mockDialogflowClient.ts, so a demo run always has something recognizable to show. */
const BROCCOLI_FINDING: RubricFinding = {
  rubricId: 'food-aversion',
  reasonToChange:
    'Broccoli reads as a disliked vegetable to American kids, but not to Japanese kids — the joke has no basis in the target market.',
  evidence:
    'Documented case: Pixar re-animated this exact line for Inside Out\'s Japanese release, swapping in green peppers.',
  sources: ['https://www.businessinsider.com/inside-out-pixar-broccoli-japan-2015-6'],
  changeDirection: 'Swap the disliked food for one Japanese kids commonly dislike, e.g. green peppers.',
};

function mockFindingsFor(item: ResearchItem): RubricFinding[] {
  const haystack = `${item.scriptLine} ${item.sceneDescription}`.toLowerCase();
  if (haystack.includes('broccoli')) {
    return [BROCCOLI_FINDING];
  }
  return [];
}

export function createMockResearchAgent(): ResearchAgent {
  return {
    async researchBatch({ items, targetCountry, onBatchComplete }) {
      const results: ResearchResult[] = [];
      const batches = chunk(items, BATCH_SIZE);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResults: ResearchResult[] = batch.map((item) => ({
          itemId: item.id,
          targetCountry,
          findings: mockFindingsFor(item),
        }));
        results.push(...batchResults);
        onBatchComplete?.({
          batchIndex,
          totalBatches: batches.length,
          itemIds: batch.map((i) => i.id),
          results: batchResults,
        });
      }
      return results;
    },
  };
}
