import { BATCH_SIZE, chunk } from './researchAgent.js';
import type {
  ResearchAgent,
  ResearchItem,
  ResearchResult,
  RubricScore,
  Rubric,
} from './researchAgent.js';

/** Canned food-aversion score referencing the same documented Inside Out case used
 * by insideOutDetails.ts, so a demo run always has something recognizable to show. */
function mockScoreFor(rubric: Rubric, isBroccoli: boolean): RubricScore {
  if (isBroccoli && rubric.id === 'food-aversion') {
    return {
      rubricId: 'food-aversion',
      score: 9,
      reasoning:
        'Broccoli reads as a disliked vegetable to American kids, but not to Japanese kids — the joke has no basis in the target market.',
      evidence:
        "Documented case: Pixar re-animated this exact line for Inside Out's Japanese release, swapping in green peppers.",
      sources: ['https://www.businessinsider.com/inside-out-pixar-broccoli-japan-2015-6'],
    };
  }
  return {
    rubricId: rubric.id,
    score: 1,
    reasoning: `No signal for "${rubric.description}" was found in this mock item.`,
    evidence: '(mock data — no web search performed)',
    sources: [],
  };
}

function mockResultFor(item: ResearchItem, targetCountry: string, rubrics: Rubric[]): ResearchResult {
  const haystack = `${item.scriptLine} ${item.sceneDescription}`.toLowerCase();
  const isBroccoli = haystack.includes('broccoli');
  const scores = rubrics.map((r) => mockScoreFor(r, isBroccoli));
  const shouldTranscreate = isBroccoli && rubrics.some((r) => r.id === 'food-aversion');

  return {
    itemId: item.id,
    targetCountry,
    scores,
    summary: shouldTranscreate
      ? "The broccoli reference scores high on food-aversion — it assumes an American kid's dislike that doesn't hold in the target market. Recommend transcreating."
      : 'No rubric scored high enough to warrant a change for this item.',
    shouldTranscreate,
    ...(shouldTranscreate
      ? {
          suggestedReplacement: {
            text: 'Swap the disliked food for one Japanese kids commonly dislike, e.g. green peppers.',
            justification: 'Matches the real Pixar localization precedent for this exact scene.',
          },
        }
      : {}),
  };
}

export function createMockResearchAgent(): ResearchAgent {
  return {
    async researchBatch({ items, targetCountry, rubrics, onBatchComplete }) {
      const results: ResearchResult[] = [];
      const batches = chunk(items, BATCH_SIZE);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResults: ResearchResult[] = batch.map((item) =>
          mockResultFor(item, targetCountry, rubrics),
        );
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
