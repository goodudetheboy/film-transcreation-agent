import { describe, it, expect, vi } from 'vitest';
import { acceptResearchResult, discardResearchResult, acceptResearchResults, discardResearchResults } from './researchResultActions.js';
import { createInMemoryResearchRunStore } from './researchRunStore.js';
import { createInMemoryProjectItemStore } from './projectItemStore.js';
import { createInMemoryProjectRubricStore } from './projectRubricStore.js';
import { createResearchRunEventBus } from './researchRunEventBus.js';
import type { ResearchResult } from './projectTypes.js';

function resultFor(itemId: string, rubricId: string): ResearchResult {
  const now = new Date().toISOString();
  return {
    itemId,
    targetCountry: 'Japan',
    scores: [{ rubricId, score: 9, reasoning: 'reason', evidence: 'evidence', sources: [], updatedAt: now, updatedBy: 'batch-agent' }],
    summary: 'should change',
    shouldTranscreate: true,
    suggestedReplacement: { text: 'replacement', justification: 'because' },
  };
}

async function buildDeps() {
  const researchRunStore = createInMemoryResearchRunStore();
  const projectItemStore = createInMemoryProjectItemStore();
  const projectRubricStore = createInMemoryProjectRubricStore();
  const eventBus = createResearchRunEventBus();

  const rubric = await projectRubricStore.createRubric('proj-a', { name: 'Test', description: 'd', weight: 3, trendEligible: false });
  const items = await projectItemStore.createItems('proj-a', [
    { filmId: 'film-a', detailRowId: 'row-1', startMs: 0, endMs: 1000, subtitleText: 'one', sceneDescription: '', customValues: {} },
    { filmId: 'film-a', detailRowId: 'row-2', startMs: 1000, endMs: 2000, subtitleText: 'two', sceneDescription: '', customValues: {} },
    { filmId: 'film-a', detailRowId: 'row-3', startMs: 2000, endMs: 3000, subtitleText: 'three', sceneDescription: '', customValues: {} },
  ]);

  const run = await researchRunStore.createRun({ projectId: 'proj-a', mode: 'need-research', itemIds: items.map((i) => i.id), rubricIds: [rubric.id], testMode: true });
  const runWithResults = await researchRunStore.updateRun('proj-a', run.id, {
    status: 'done',
    pendingResults: items.map((i) => resultFor(i.id, rubric.id)),
  });

  return { researchRunStore, projectItemStore, projectRubricStore, eventBus, rubric, items, run: runWithResults! };
}

describe('acceptResearchResult', () => {
  it('applies the result to the item and removes it from pendingResults', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items, run } = await buildDeps();
    const result = await acceptResearchResult({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, items[0].id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.shouldTranscreate).toBe(true);
    expect(result.value.summary).toBe('should change');
    expect(result.value.action).toBe('pending');
    expect(result.value.importanceScore).toBe(9);

    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults.map((r) => r.itemId)).toEqual([items[1].id, items[2].id]);
  });

  it('returns an error for an unknown run', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items } = await buildDeps();
    const result = await acceptResearchResult({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', 'no-such-run', items[0].id);
    expect(result).toEqual({ ok: false, error: 'research run not found' });
  });

  it('returns an error for an unknown pending result', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, run } = await buildDeps();
    const result = await acceptResearchResult({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, 'no-such-item');
    expect(result).toEqual({ ok: false, error: 'pending result not found' });
  });

  it('leaves the pending entry in place and errors if the target item was deleted before acceptance', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items, run } = await buildDeps();
    await projectItemStore.deleteItem('proj-a', items[0].id);

    const result = await acceptResearchResult({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, items[0].id);
    expect(result).toEqual({ ok: false, error: 'item not found' });

    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults.map((r) => r.itemId)).toContain(items[0].id);
  });
});

describe('discardResearchResult', () => {
  it('removes the pending result without touching the item', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items, run } = await buildDeps();
    const result = await discardResearchResult({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, items[0].id);
    expect(result).toEqual({ ok: true, value: undefined });

    const item = await projectItemStore.getItem('proj-a', items[0].id);
    expect(item?.shouldTranscreate).toBeNull();
    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults.map((r) => r.itemId)).toEqual([items[1].id, items[2].id]);
  });

  it('returns an error for an unknown pending result', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, run } = await buildDeps();
    const result = await discardResearchResult({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, 'no-such-item');
    expect(result).toEqual({ ok: false, error: 'pending result not found' });
  });
});

describe('acceptResearchResults (bulk)', () => {
  it('accepts every matching itemId in one updateRun call, ignoring unknown ids', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items, run } = await buildDeps();
    const updateRunSpy = vi.spyOn(researchRunStore, 'updateRun');

    const result = await acceptResearchResults(
      { researchRunStore, projectItemStore, projectRubricStore, eventBus },
      'proj-a',
      run.id,
      [items[0].id, items[1].id, 'not-a-real-id'],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.map((i) => i.id).sort()).toEqual([items[0].id, items[1].id].sort());
    expect(updateRunSpy).toHaveBeenCalledTimes(1);

    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults.map((r) => r.itemId)).toEqual([items[2].id]);
  });

  it('returns an error and makes no changes when no itemId matches', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, run } = await buildDeps();
    const result = await acceptResearchResults({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, ['nope']);
    expect(result.ok).toBe(false);
    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults).toHaveLength(3);
  });

  it('returns an error for an unknown run', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items } = await buildDeps();
    const result = await acceptResearchResults({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', 'no-such-run', [items[0].id]);
    expect(result).toEqual({ ok: false, error: 'research run not found' });
  });
});

describe('discardResearchResults (bulk)', () => {
  it('discards every matching itemId in one updateRun call, ignoring unknown ids, without touching items', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, items, run } = await buildDeps();
    const updateRunSpy = vi.spyOn(researchRunStore, 'updateRun');

    const result = await discardResearchResults(
      { researchRunStore, projectItemStore, projectRubricStore, eventBus },
      'proj-a',
      run.id,
      [items[1].id, 'not-a-real-id'],
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(updateRunSpy).toHaveBeenCalledTimes(1);

    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults.map((r) => r.itemId)).toEqual([items[0].id, items[2].id]);
    const item = await projectItemStore.getItem('proj-a', items[1].id);
    expect(item?.shouldTranscreate).toBeNull();
  });

  it('returns an error and makes no changes when no itemId matches', async () => {
    const { researchRunStore, projectItemStore, projectRubricStore, eventBus, run } = await buildDeps();
    const result = await discardResearchResults({ researchRunStore, projectItemStore, projectRubricStore, eventBus }, 'proj-a', run.id, ['nope']);
    expect(result.ok).toBe(false);
    const updatedRun = await researchRunStore.getRun('proj-a', run.id);
    expect(updatedRun?.pendingResults).toHaveLength(3);
  });
});
