import { describe, it, expect, vi } from 'vitest';
import { createDiscoveryQueueWorker } from './discoveryQueueWorker.js';
import { createInMemoryDiscoveryJobStore } from './discoveryJobStore.js';
import { createInMemoryFilmStore } from './filmStore.js';
import { createDiscoveryEventBus } from './discoveryEventBus.js';
import type { DiscoveryAgent } from './discoveryAgent.js';

const SUBTITLE = {
  fileUrl: 'gs://bucket/x.srt',
  format: 'srt' as const,
  entries: [{ id: 'e1', index: 0, startMs: 0, endMs: 1000, text: 'Hi' }],
};

function fakeAgent(run: DiscoveryAgent['runPass']): DiscoveryAgent {
  return { runPass: run };
}

describe('discoveryQueueWorker.processOne', () => {
  it('claims a queued job, runs the mock (testMode) agent, and marks it done with results', async () => {
    const jobStore = createInMemoryDiscoveryJobStore();
    const filmStore = createInMemoryFilmStore();
    const film = await filmStore.createFilm({
      title: 'F',
      videoUrl: 'gs://bucket/v.mp4',
      subtitle: SUBTITLE,
      runDiscoveryOnCreate: false,
    });
    await jobStore.createJob({ filmId: film.id, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });

    const mockAgent = fakeAgent(async () => ({
      resultRows: [{ tempId: 't1', subtitleEntryId: 'e1', timestamp: '00:00', subtitleText: 'Hi', values: { segmentDescription: 'x' } }],
      updatedConversation: [],
    }));
    const realAgent = fakeAgent(async () => {
      throw new Error('real agent should not be called in test mode');
    });

    const worker = createDiscoveryQueueWorker({
      discoveryJobStore: jobStore,
      filmStore,
      discoveryAgent: realAgent,
      mockDiscoveryAgent: mockAgent,
      eventBus: createDiscoveryEventBus(),
    });

    expect(await worker.processOne()).toBe(true);
    const [job] = await jobStore.listJobs(film.id);
    expect(job.status).toBe('done');
    expect(job.resultRows).toHaveLength(1);
    expect(await worker.processOne()).toBe(false);
  });

  it('marks the job errored and records the message when the agent throws', async () => {
    const jobStore = createInMemoryDiscoveryJobStore();
    const filmStore = createInMemoryFilmStore();
    const film = await filmStore.createFilm({
      title: 'F',
      videoUrl: 'gs://bucket/v.mp4',
      subtitle: SUBTITLE,
      runDiscoveryOnCreate: false,
    });
    await jobStore.createJob({ filmId: film.id, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });

    const worker = createDiscoveryQueueWorker({
      discoveryJobStore: jobStore,
      filmStore,
      discoveryAgent: fakeAgent(async () => {
        throw new Error('real');
      }),
      mockDiscoveryAgent: fakeAgent(async () => {
        throw new Error('boom');
      }),
      eventBus: createDiscoveryEventBus(),
    });

    await worker.processOne();
    const [job] = await jobStore.listJobs(film.id);
    expect(job.status).toBe('error');
    expect(job.errorMessage).toBe('boom');
  });

  it('publishes job_update events on the eventBus keyed by discoveryJob:<id>', async () => {
    const jobStore = createInMemoryDiscoveryJobStore();
    const filmStore = createInMemoryFilmStore();
    const film = await filmStore.createFilm({
      title: 'F',
      videoUrl: 'gs://bucket/v.mp4',
      subtitle: SUBTITLE,
      runDiscoveryOnCreate: false,
    });
    const job = await jobStore.createJob({ filmId: film.id, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });

    const eventBus = createDiscoveryEventBus();
    const received: unknown[] = [];
    eventBus.subscribe(`discoveryJob:${job.id}`, (e) => received.push(e));

    const worker = createDiscoveryQueueWorker({
      discoveryJobStore: jobStore,
      filmStore,
      discoveryAgent: fakeAgent(async () => ({ resultRows: [], updatedConversation: [] })),
      mockDiscoveryAgent: fakeAgent(async () => ({ resultRows: [], updatedConversation: [] })),
      eventBus,
    });

    await worker.processOne();
    expect(received.length).toBeGreaterThan(0);
    expect((received[received.length - 1] as any).job.status).toBe('done');
  });
});
