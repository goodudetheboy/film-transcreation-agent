import { describe, it, expect } from 'vitest';
import { createInMemoryResearchRunStore } from './researchRunStore.js';

describe('createInMemoryResearchRunStore', () => {
  it('createRun defaults to queued status with zeroed batch counters', async () => {
    const store = createInMemoryResearchRunStore();
    const run = await store.createRun({ projectId: 'proj-a', mode: 'need-research', itemIds: ['i1'], rubricIds: ['r1'], testMode: true });
    expect(run.status).toBe('queued');
    expect(run.totalBatches).toBe(0);
    expect(run.completedBatches).toBe(0);
    expect(run.startedAt).toBeNull();
    expect(run.finishedAt).toBeNull();
  });

  it('listRuns scopes per project, newest first', async () => {
    const store = createInMemoryResearchRunStore();
    const a = await store.createRun({ projectId: 'proj-a', mode: 'need-research', itemIds: [], rubricIds: [], testMode: true });
    await new Promise((r) => setTimeout(r, 2)); // ensure a distinct createdAt for a deterministic sort order
    const b = await store.createRun({ projectId: 'proj-a', mode: 'custom', itemIds: [], rubricIds: [], testMode: true });
    await store.createRun({ projectId: 'proj-b', mode: 'need-research', itemIds: [], rubricIds: [], testMode: true });
    const listed = await store.listRuns('proj-a');
    expect(listed.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('updateRun patches status/progress fields, scoped per project', async () => {
    const store = createInMemoryResearchRunStore();
    const run = await store.createRun({ projectId: 'proj-a', mode: 'need-research', itemIds: ['i1'], rubricIds: ['r1'], testMode: true });
    const updated = await store.updateRun('proj-a', run.id, { status: 'running', totalBatches: 2, completedBatches: 1 });
    expect(updated).toMatchObject({ status: 'running', totalBatches: 2, completedBatches: 1 });
    expect(await store.updateRun('proj-b', run.id, { status: 'error' })).toBeUndefined();
  });

  it('getRun returns undefined for a run under the wrong project', async () => {
    const store = createInMemoryResearchRunStore();
    const run = await store.createRun({ projectId: 'proj-a', mode: 'need-research', itemIds: [], rubricIds: [], testMode: true });
    expect(await store.getRun('proj-a', run.id)).toEqual(run);
    expect(await store.getRun('proj-b', run.id)).toBeUndefined();
  });
});
