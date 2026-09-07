import type { ProjectItem } from './projectTypes.js';
import type { ResearchRunStore } from './researchRunStore.js';
import type { ProjectItemStore } from './projectItemStore.js';
import type { ProjectRubricStore } from './projectRubricStore.js';
import type { ResearchRunEventBus } from './researchRunEventBus.js';
import { computeImportanceScore } from './importanceScore.js';

export interface ResearchResultActionsDeps {
  researchRunStore: ResearchRunStore;
  projectItemStore: ProjectItemStore;
  projectRubricStore: ProjectRubricStore;
  eventBus: ResearchRunEventBus;
}

export type ResearchResultActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Accepts one of a run's pending results onto the real ProjectItem —
 * mirrors mergeDiscoveryResult's role, adapted for "patch an existing item"
 * instead of "create a new row." Rubrics are re-fetched fresh here rather
 * than trusting whatever existed when the batch ran, so a rubric deleted in
 * between doesn't get scored against stale weights.
 */
export async function acceptResearchResult(
  deps: ResearchResultActionsDeps,
  projectId: string,
  runId: string,
  itemId: string,
): Promise<ResearchResultActionResult<ProjectItem>> {
  const run = await deps.researchRunStore.getRun(projectId, runId);
  if (!run) return { ok: false, error: 'research run not found' };
  const result = run.pendingResults.find((r) => r.itemId === itemId);
  if (!result) return { ok: false, error: 'pending result not found' };

  const rubrics = await deps.projectRubricStore.listRubrics(projectId);
  const importanceScore = computeImportanceScore(result.scores, rubrics);

  const updatedItem = await deps.projectItemStore.applyResearchResult(projectId, itemId, {
    scores: result.scores,
    summary: result.summary,
    shouldTranscreate: result.shouldTranscreate,
    suggestedReplacement: result.suggestedReplacement ?? null,
    importanceScore,
  });
  // Item was deleted between the run and this accept — leave the pending
  // entry in place (don't silently drop it) so a reviewer sees an error
  // instead of the row just vanishing with no explanation.
  if (!updatedItem) return { ok: false, error: 'item not found' };

  const updatedRun = await deps.researchRunStore.updateRun(projectId, run.id, {
    pendingResults: run.pendingResults.filter((r) => r.itemId !== itemId),
  });
  if (updatedRun) deps.eventBus.publish(`researchRun:${run.id}`, { type: 'run_update', run: updatedRun });

  return { ok: true, value: updatedItem };
}

/** Discards one of a run's pending results — never touches the ProjectItem,
 * only removes it from the run's pending results. */
export async function discardResearchResult(
  deps: ResearchResultActionsDeps,
  projectId: string,
  runId: string,
  itemId: string,
): Promise<ResearchResultActionResult<void>> {
  const run = await deps.researchRunStore.getRun(projectId, runId);
  if (!run) return { ok: false, error: 'research run not found' };
  if (!run.pendingResults.some((r) => r.itemId === itemId)) return { ok: false, error: 'pending result not found' };

  const updatedRun = await deps.researchRunStore.updateRun(projectId, run.id, {
    pendingResults: run.pendingResults.filter((r) => r.itemId !== itemId),
  });
  if (updatedRun) deps.eventBus.publish(`researchRun:${run.id}`, { type: 'run_update', run: updatedRun });

  return { ok: true, value: undefined };
}

/**
 * Bulk sibling of acceptResearchResult. Unlike Discovery's bulk merge (one
 * DetailRowsStore.addRows batch write), each ProjectItem is an independent
 * Firestore document, so this necessarily does N applyResearchResult calls —
 * still just one getRun/one updateRun for the run doc itself.
 */
export async function acceptResearchResults(
  deps: ResearchResultActionsDeps,
  projectId: string,
  runId: string,
  itemIds: string[],
): Promise<ResearchResultActionResult<ProjectItem[]>> {
  const run = await deps.researchRunStore.getRun(projectId, runId);
  if (!run) return { ok: false, error: 'research run not found' };

  const idSet = new Set(itemIds);
  const toAccept = run.pendingResults.filter((r) => idSet.has(r.itemId));
  if (toAccept.length === 0) return { ok: false, error: 'no matching pending results' };

  const rubrics = await deps.projectRubricStore.listRubrics(projectId);
  const updatedItems: ProjectItem[] = [];
  const acceptedIds = new Set<string>();
  for (const result of toAccept) {
    const importanceScore = computeImportanceScore(result.scores, rubrics);
    const updatedItem = await deps.projectItemStore.applyResearchResult(projectId, result.itemId, {
      scores: result.scores,
      summary: result.summary,
      shouldTranscreate: result.shouldTranscreate,
      suggestedReplacement: result.suggestedReplacement ?? null,
      importanceScore,
    });
    if (updatedItem) {
      updatedItems.push(updatedItem);
      acceptedIds.add(result.itemId);
    }
  }

  const updatedRun = await deps.researchRunStore.updateRun(projectId, run.id, {
    pendingResults: run.pendingResults.filter((r) => !acceptedIds.has(r.itemId)),
  });
  if (updatedRun) deps.eventBus.publish(`researchRun:${run.id}`, { type: 'run_update', run: updatedRun });

  return { ok: true, value: updatedItems };
}

/** Bulk sibling of discardResearchResult — one getRun, one updateRun. */
export async function discardResearchResults(
  deps: ResearchResultActionsDeps,
  projectId: string,
  runId: string,
  itemIds: string[],
): Promise<ResearchResultActionResult<void>> {
  const run = await deps.researchRunStore.getRun(projectId, runId);
  if (!run) return { ok: false, error: 'research run not found' };

  const idSet = new Set(itemIds);
  const remaining = run.pendingResults.filter((r) => !idSet.has(r.itemId));
  if (remaining.length === run.pendingResults.length) return { ok: false, error: 'no matching pending results' };

  const updatedRun = await deps.researchRunStore.updateRun(projectId, run.id, { pendingResults: remaining });
  if (updatedRun) deps.eventBus.publish(`researchRun:${run.id}`, { type: 'run_update', run: updatedRun });

  return { ok: true, value: undefined };
}
