import { describe, it, expect } from 'vitest';
import { createFilmPrepPipeline } from './filmPrepPipeline.js';
import { createInMemoryFilmStore } from './filmStore.js';
import { createInMemoryDetailRowsStore } from './detailRowsStore.js';
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

describe('filmPrepPipeline.run', () => {
  it('without runDiscoveryOnCreate: goes straight to finalizing then ready, and marks the film processed', async () => {
    const filmStore = createInMemoryFilmStore();
    const detailRowsStore = createInMemoryDetailRowsStore();
    const film = await filmStore.createFilm({
      title: 'F',
      videoUrl: 'gs://bucket/v.mp4',
      subtitle: SUBTITLE,
      runDiscoveryOnCreate: false,
    });

    const pipeline = createFilmPrepPipeline({
      filmStore,
      detailRowsStore,
      discoveryAgent: fakeAgent(async () => {
        throw new Error('should not be called');
      }),
      mockDiscoveryAgent: fakeAgent(async () => {
        throw new Error('should not be called');
      }),
      eventBus: createDiscoveryEventBus(),
      mockDelayScale: 0.01,
    });

    await pipeline.run(film.id, true);
    const final = await filmStore.getFilm(film.id);
    expect(final?.prep.stage).toBe('ready');
    expect(final?.prep.finalizeDone).toBe(true);
    expect(final?.status).toBe('processed');
  });

  it('with runDiscoveryOnCreate: runs one pass and auto-merges its rows into detailRows before finalizing', async () => {
    const filmStore = createInMemoryFilmStore();
    const detailRowsStore = createInMemoryDetailRowsStore();
    const film = await filmStore.createFilm({
      title: 'F',
      videoUrl: 'gs://bucket/v.mp4',
      subtitle: SUBTITLE,
      runDiscoveryOnCreate: true,
    });

    const mockAgent = fakeAgent(async () => ({
      resultRows: [{ tempId: 't1', startMs: 0, endMs: 1000, subtitleText: 'Hi', values: { segmentDescription: 'x' } }],
      updatedConversation: [],
    }));

    const pipeline = createFilmPrepPipeline({
      filmStore,
      detailRowsStore,
      discoveryAgent: fakeAgent(async () => {
        throw new Error('should not be called in mock mode');
      }),
      mockDiscoveryAgent: mockAgent,
      eventBus: createDiscoveryEventBus(),
      mockDelayScale: 0.01,
    });

    await pipeline.run(film.id, true);

    const rows = await detailRowsStore.listRows(film.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].provenance.type).toBe('agent-discovered');

    const final = await filmStore.getFilm(film.id);
    expect(final?.prep.stage).toBe('ready');
    expect(final?.prep.discoveryDone).toBe(true);
  });

  it('sets stage to error and records the message when something throws', async () => {
    const filmStore = createInMemoryFilmStore();
    const detailRowsStore = createInMemoryDetailRowsStore();
    const film = await filmStore.createFilm({
      title: 'F',
      videoUrl: 'gs://bucket/v.mp4',
      subtitle: SUBTITLE,
      runDiscoveryOnCreate: true,
    });

    const pipeline = createFilmPrepPipeline({
      filmStore,
      detailRowsStore,
      discoveryAgent: fakeAgent(async () => {
        throw new Error('should not be called');
      }),
      mockDiscoveryAgent: fakeAgent(async () => {
        throw new Error('boom');
      }),
      eventBus: createDiscoveryEventBus(),
      mockDelayScale: 0.01,
    });

    await pipeline.run(film.id, true);
    const final = await filmStore.getFilm(film.id);
    expect(final?.prep.stage).toBe('error');
    expect(final?.prep.errorMessage).toBe('boom');
  });
});
