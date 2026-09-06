import { describe, it, expect, vi } from 'vitest';
import { mergeDiscoveryResults, discardDiscoveryResults } from './discoveryResultActions.js';
import { createInMemoryDetailRowsStore } from './detailRowsStore.js';
import { createInMemoryDiscoveryJobStore } from './discoveryJobStore.js';
import { createDiscoveryEventBus } from './discoveryEventBus.js';

async function buildDeps() {
  const detailRowsStore = createInMemoryDetailRowsStore();
  const discoveryJobStore = createInMemoryDiscoveryJobStore();
  const eventBus = createDiscoveryEventBus();

  const job = await discoveryJobStore.createJob({
    filmId: 'film-a',
    specialInstruction: '',
    targetColumns: ['segmentDescription'],
    testMode: true,
  });
  const jobWithCandidates = await discoveryJobStore.updateJob('film-a', job.id, {
    status: 'done',
    resultRows: [
      { tempId: 'cand-1', startMs: 0, endMs: 1000, subtitleText: 'one', values: { segmentDescription: 'a' } },
      { tempId: 'cand-2', startMs: 1000, endMs: 2000, subtitleText: 'two', values: { segmentDescription: 'b' } },
      { tempId: 'cand-3', startMs: 2000, endMs: 3000, subtitleText: 'three', values: { segmentDescription: 'c' } },
    ],
  });

  return { detailRowsStore, discoveryJobStore, eventBus, job: jobWithCandidates! };
}

describe('mergeDiscoveryResults', () => {
  it('merges every matching tempId into the Details table in one updateJob call, ignoring unknown ids', async () => {
    const { detailRowsStore, discoveryJobStore, eventBus, job } = await buildDeps();
    const updateJobSpy = vi.spyOn(discoveryJobStore, 'updateJob');

    const result = await mergeDiscoveryResults({ discoveryJobStore, detailRowsStore, eventBus }, 'film-a', job.id, [
      'cand-1',
      'cand-3',
      'not-a-real-id',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.map((r) => r.subtitleText)).toEqual(['one', 'three']);
    expect(result.value[0].provenance).toMatchObject({ type: 'agent-discovered', jobId: job.id, agentNumber: job.agentNumber, passNumber: job.passNumber });

    expect(updateJobSpy).toHaveBeenCalledTimes(1);
    const updatedJob = await discoveryJobStore.getJob('film-a', job.id);
    expect(updatedJob?.resultRows.map((r) => r.tempId)).toEqual(['cand-2']);

    const rows = await detailRowsStore.listRows('film-a');
    expect(rows.map((r) => r.subtitleText).sort()).toEqual(['one', 'three']);
  });

  it('returns an error and makes no changes when no tempId matches', async () => {
    const { detailRowsStore, discoveryJobStore, eventBus, job } = await buildDeps();
    const result = await mergeDiscoveryResults({ discoveryJobStore, detailRowsStore, eventBus }, 'film-a', job.id, ['nope']);
    expect(result.ok).toBe(false);
    expect(await detailRowsStore.listRows('film-a')).toHaveLength(0);
  });

  it('returns an error for an unknown job', async () => {
    const { detailRowsStore, discoveryJobStore, eventBus } = await buildDeps();
    const result = await mergeDiscoveryResults({ discoveryJobStore, detailRowsStore, eventBus }, 'film-a', 'no-such-job', ['cand-1']);
    expect(result).toEqual({ ok: false, error: 'discovery job not found' });
  });
});

describe('discardDiscoveryResults', () => {
  it('discards every matching tempId in one updateJob call, ignoring unknown ids, without touching the Details table', async () => {
    const { detailRowsStore, discoveryJobStore, eventBus, job } = await buildDeps();
    const updateJobSpy = vi.spyOn(discoveryJobStore, 'updateJob');

    const result = await discardDiscoveryResults({ discoveryJobStore, detailRowsStore, eventBus }, 'film-a', job.id, [
      'cand-2',
      'not-a-real-id',
    ]);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(updateJobSpy).toHaveBeenCalledTimes(1);

    const updatedJob = await discoveryJobStore.getJob('film-a', job.id);
    expect(updatedJob?.resultRows.map((r) => r.tempId)).toEqual(['cand-1', 'cand-3']);
    expect(await detailRowsStore.listRows('film-a')).toHaveLength(0);
  });

  it('returns an error and makes no changes when no tempId matches', async () => {
    const { detailRowsStore, discoveryJobStore, eventBus, job } = await buildDeps();
    const result = await discardDiscoveryResults({ discoveryJobStore, detailRowsStore, eventBus }, 'film-a', job.id, ['nope']);
    expect(result.ok).toBe(false);
    const updatedJob = await discoveryJobStore.getJob('film-a', job.id);
    expect(updatedJob?.resultRows).toHaveLength(3);
  });
});
