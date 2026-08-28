import { describe, it, expect } from 'vitest';
import { createInMemoryDiscoveryJobStore } from './discoveryJobStore.js';

function baseInput(filmId: string, overrides: Record<string, unknown> = {}) {
  return {
    filmId,
    specialInstruction: 'Focus on gestures',
    targetColumns: ['segmentDescription'],
    testMode: true,
    ...overrides,
  };
}

describe('createInMemoryDiscoveryJobStore', () => {
  it('assigns agentNumber 1/passNumber 1 to the first job for a film, incrementing agentNumber on the next unlabeled job', async () => {
    const store = createInMemoryDiscoveryJobStore();
    const first = await store.createJob(baseInput('film-a'));
    expect(first).toMatchObject({ agentNumber: 1, passNumber: 1, status: 'queued' });

    const second = await store.createJob(baseInput('film-a'));
    expect(second).toMatchObject({ agentNumber: 2, passNumber: 1 });
  });

  it('a second job requesting the same agentNumber gets the next passNumber', async () => {
    const store = createInMemoryDiscoveryJobStore();
    const first = await store.createJob(baseInput('film-a'));
    const rerun = await store.createJob(baseInput('film-a', { agentNumber: first.agentNumber }));
    expect(rerun).toMatchObject({ agentNumber: first.agentNumber, passNumber: 2 });
  });

  it('listJobs is scoped per film and ordered by creation', async () => {
    const store = createInMemoryDiscoveryJobStore();
    await store.createJob(baseInput('film-a'));
    await store.createJob(baseInput('film-b'));
    expect(await store.listJobs('film-a')).toHaveLength(1);
    expect(await store.listJobs('film-b')).toHaveLength(1);
  });

  it('getJob/updateJob scope to the given filmId, returning undefined on a mismatch', async () => {
    const store = createInMemoryDiscoveryJobStore();
    const job = await store.createJob(baseInput('film-a'));
    expect(await store.getJob('film-b', job.id)).toBeUndefined();
    expect(await store.updateJob('film-b', job.id, { status: 'done' })).toBeUndefined();

    const updated = await store.updateJob('film-a', job.id, { status: 'done' });
    expect(updated?.status).toBe('done');
  });

  it('claimNextQueuedJob returns the oldest queued job across all films, in FIFO order, marking it running', async () => {
    const store = createInMemoryDiscoveryJobStore();
    const a = await store.createJob(baseInput('film-a'));
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.createJob(baseInput('film-b'));

    const claimed = await store.claimNextQueuedJob();
    expect(claimed?.id).toBe(a.id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.startedAt).toBeTruthy();

    const claimed2 = await store.claimNextQueuedJob();
    expect(claimed2?.id).toBe(b.id);

    expect(await store.claimNextQueuedJob()).toBeUndefined();
  });

  it('resetStaleRunningJobs puts every running job back to queued', async () => {
    const store = createInMemoryDiscoveryJobStore();
    await store.createJob(baseInput('film-a'));
    const running = await store.claimNextQueuedJob();
    expect(running?.status).toBe('running');

    await store.resetStaleRunningJobs();
    const job = await store.getJob('film-a', running!.id);
    expect(job?.status).toBe('queued');
  });
});
