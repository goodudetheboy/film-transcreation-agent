import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFilm, createDiscoveryJob, listDetails, uploadSubtitleFile, uploadVideoFile } from '../../frontend/src/api/filmsApiClient';
import {
  createDiscoveryAgentSession,
  listDiscoveryAgentSessions,
  logDiscoveryRun,
  sendDiscoveryChatMessage,
} from '../../frontend/src/api/discoveryChatApiClient';
import type { DiscoveryChatStreamEvent } from '../../frontend/src/api/apiClient.types';
import { startTestBackend, type TestBackend } from './helpers/startTestBackend';
import { fakeDiscoveryAgent } from './helpers/fakeDiscoveryAgent';
import { createInMemoryFilmStore } from '../../backend/src/services/filmStore';
import { createInMemoryDetailRowsStore } from '../../backend/src/services/detailRowsStore';
import { createInMemoryDiscoveryJobStore } from '../../backend/src/services/discoveryJobStore';
import { createDiscoveryEventBus } from '../../backend/src/services/discoveryEventBus';
import { createDiscoveryQueueWorker, type DiscoveryQueueWorker } from '../../backend/src/services/discoveryQueueWorker';

const TEST_PASSCODE = 'integration-test-passcode';
const SRT = '1\n00:00:01,000 --> 00:00:04,000\nHello there.\n';

describe('frontend discoveryChatApiClient -> real backend -> mock discovery chat agent', () => {
  let backend: TestBackend;
  let worker: DiscoveryQueueWorker;

  beforeAll(async () => {
    const filmStore = createInMemoryFilmStore();
    const detailRowsStore = createInMemoryDetailRowsStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const eventBus = createDiscoveryEventBus();
    const discoveryAgent = fakeDiscoveryAgent();

    backend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000, mockDelayScale: 0.01 },
      filmStore,
      detailRowsStore,
      discoveryJobStore,
      eventBus,
      discoveryAgent,
      mockDiscoveryAgent: discoveryAgent,
    });

    worker = createDiscoveryQueueWorker({ discoveryJobStore, filmStore, detailRowsStore, discoveryAgent, mockDiscoveryAgent: discoveryAgent, eventBus });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('kicks off an Agent thread, logs a run inline, and the mock chat agent merges the candidate for real', async () => {
    const { videoUrl } = await uploadVideoFile(
      new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' }),
      { passcode: TEST_PASSCODE, testMode: true },
      { baseUrl: backend.url },
    );
    const { subtitleUrl, format, entries } = await uploadSubtitleFile(
      new File([SRT], 'clip.srt', { type: 'text/plain' }),
      { passcode: TEST_PASSCODE, testMode: true },
      { baseUrl: backend.url },
    );
    const film = await createFilm(
      { passcode: TEST_PASSCODE, title: 'Chat Film', videoUrl, subtitleUrl, subtitleFormat: format, subtitleEntries: entries, runDiscovery: false, testMode: true },
      { baseUrl: backend.url },
    );

    // ---- Start the Agent thread, kick off Run #1 from inside it ----
    const session = await createDiscoveryAgentSession(film.id, { passcode: TEST_PASSCODE }, { baseUrl: backend.url });
    expect(session.agentNumber).toBe(1);

    const job = await createDiscoveryJob(
      film.id,
      { passcode: TEST_PASSCODE, agentNumber: session.agentNumber, specialInstruction: 'find something', targetColumns: ['segmentDescription'], testMode: true },
      { baseUrl: backend.url },
    );
    expect(await worker.processOne()).toBe(true);

    const loggedSession = await logDiscoveryRun(film.id, session.id, { passcode: TEST_PASSCODE, jobId: job.id }, { baseUrl: backend.url });
    expect(loggedSession.turns).toEqual([{ role: 'system', parts: [{ run: { jobId: job.id } }], ts: expect.any(String) }]);

    // ---- Chat with the agent about it — the mock agent genuinely merges the candidate ----
    const events: DiscoveryChatStreamEvent[] = [];
    await sendDiscoveryChatMessage(film.id, session.id, { passcode: TEST_PASSCODE, text: 'add the best one you found', testMode: true }, (e) => events.push(e), {
      baseUrl: backend.url,
    });
    expect(events.at(-1)).toEqual({ type: 'turn_done' });
    expect(events.some((e) => e.type === 'row_added')).toBe(true);

    const details = await listDetails(film.id, TEST_PASSCODE, { baseUrl: backend.url });
    expect(details.rows).toHaveLength(1);
    expect(details.rows[0].provenance).toMatchObject({ type: 'agent-discovered', jobId: job.id });

    const sessions = await listDiscoveryAgentSessions(film.id, TEST_PASSCODE, { baseUrl: backend.url });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].turns.length).toBeGreaterThan(1);
  });
});
