import type { Rubric, RubricScore } from './projectTypes.js';

/**
 * Single source of truth for turning a ProjectItem's per-rubric scores into
 * one sortable importance number — used by both the batch research-run path
 * (researchRunRoute applying an exhaustive ResearchResult) and the chat
 * tool-call path (researchChatAgent's update_rubric_score executor patching
 * one rubric at a time), so the two paths can never disagree about what a
 * given set of scores means.
 *
 * Weighted average of each rubric's 0-10 score by that rubric's 1-5 weight,
 * scaled back onto the same 0-10 range a single rubric score already uses
 * (rather than a raw weighted sum, which would depend on how many rubrics
 * exist and be meaningless to compare across projects with different rubric
 * counts). Rubrics with no corresponding score yet are simply excluded —
 * `weight` only applies to rubrics that have actually been scored.
 *
 * Returns `null` when there's nothing to compute from (no scores, or none of
 * the scores match a known rubric) — an item that hasn't been researched yet
 * has `importanceScore: null`, not `0`, so the workspace table can visibly
 * distinguish "not yet scored" from "scored low."
 */
export function computeImportanceScore(scores: RubricScore[], rubrics: Rubric[]): number | null {
  const weightByRubricId = new Map(rubrics.map((r) => [r.id, r.weight]));

  let weightedSum = 0;
  let totalWeight = 0;
  for (const score of scores) {
    const weight = weightByRubricId.get(score.rubricId);
    if (weight === undefined) continue;
    weightedSum += score.score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}
