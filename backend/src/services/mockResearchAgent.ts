import { BATCH_SIZE, chunk } from './researchAgent.js';
import type {
  ResearchAgent,
  ResearchItem,
  ResearchResult,
  RubricScore,
  Rubric,
} from './researchAgent.js';

/** Rubrics are Firestore docs with a server-assigned randomUUID() id
 * (projectRubricStore.ts) — never a fixed string like "food-aversion" — so these
 * canned demo triggers match on semantic content (name for food-aversion, the
 * trendEligible flag for slang/memes) instead of a hardcoded id. */
function isFoodAversionRubric(rubric: Rubric): boolean {
  return rubric.name.toLowerCase().includes('food');
}

/** Canned food-aversion score referencing the same documented Inside Out case used
 * by insideOutDetails.ts, so a demo run always has something recognizable to show. */
function foodAversionScore(rubric: Rubric): RubricScore {
  return {
    rubricId: rubric.id,
    score: 9,
    reasoning:
      'Broccoli reads as a disliked vegetable to American kids, but not to Japanese kids — the joke has no basis in the target market.',
    evidence:
      "Documented case: Pixar re-animated this exact line for Inside Out's Japanese release, swapping in green peppers.",
    sources: ['https://www.businessinsider.com/inside-out-pixar-broccoli-japan-2015-6'],
    updatedAt: new Date().toISOString(),
    updatedBy: 'batch-agent',
  };
}

/** Canned slang/meme score for the trend-eligible rubric — gives the demo flow a
 * shouldTranscreate:true item whose flagged concern is genuinely slang/memes, so the
 * Trend Agent (gated on this exact rubric) has something real to chain onto. */
function slangMemeScore(rubric: Rubric): RubricScore {
  return {
    rubricId: rubric.id,
    score: 8,
    reasoning: 'This meme reference is dated and unlikely to land with a current audience in the target country.',
    evidence: '(mock data — a real run would check what is currently trending)',
    sources: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'batch-agent',
  };
}

function noSignalScore(rubric: Rubric): RubricScore {
  return {
    rubricId: rubric.id,
    score: 1,
    reasoning: `No signal for "${rubric.description}" was found in this mock item.`,
    evidence: '(mock data — no web search performed)',
    sources: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'batch-agent',
  };
}

function mockResultFor(item: ResearchItem, targetCountry: string, rubrics: Rubric[]): ResearchResult {
  const haystack = `${item.scriptLine} ${item.sceneDescription}`.toLowerCase();
  const isBroccoli = haystack.includes('broccoli');
  const isMeme = haystack.includes('meme');

  const scores = rubrics.map((r) => {
    if (isBroccoli && isFoodAversionRubric(r)) return foodAversionScore(r);
    if (isMeme && r.trendEligible) return slangMemeScore(r);
    return noSignalScore(r);
  });
  const shouldTranscreate = scores.some((s) => s.score >= 7);

  return {
    itemId: item.id,
    targetCountry,
    scores,
    summary: shouldTranscreate
      ? isBroccoli
        ? "The broccoli reference scores high on food-aversion — it assumes an American kid's dislike that doesn't hold in the target market. Recommend transcreating."
        : 'This slang/meme reference is dated for the target country. Recommend transcreating.'
      : 'No rubric scored high enough to warrant a change for this item.',
    shouldTranscreate,
    ...(shouldTranscreate && isBroccoli
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
        await onBatchComplete?.({
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
