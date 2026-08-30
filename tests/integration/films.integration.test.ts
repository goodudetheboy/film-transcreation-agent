import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  createDiscoveryJob,
  createFilm,
  listDetails,
  mergeDiscoveryResult,
  streamDiscoveryJob,
  streamFilmPrep,
  uploadSubtitleFile,
  uploadVideoFile,
} from '../../frontend/src/api/filmsApiClient';
import type { DiscoveryJobStreamEvent, FilmPrepStreamEvent } from '../../frontend/src/api/apiClient.types';
import { startTestBackend, type TestBackend } from './helpers/startTestBackend';
import { fakeDiscoveryAgent } from './helpers/fakeDiscoveryAgent';
import { startFakeGcsResumableServer } from './helpers/fakeGcsResumableServer';
import { createInMemoryFilmStore } from '../../backend/src/services/filmStore';
import { createInMemoryDetailRowsStore } from '../../backend/src/services/detailRowsStore';
import { createInMemoryDiscoveryJobStore } from '../../backend/src/services/discoveryJobStore';
import { createDiscoveryEventBus } from '../../backend/src/services/discoveryEventBus';
import { createDiscoveryQueueWorker, type DiscoveryQueueWorker } from '../../backend/src/services/discoveryQueueWorker';

const TEST_PASSCODE = 'integration-test-passcode';
const SRT = '1\n00:00:01,000 --> 00:00:04,000\nHello there.\n';

describe('frontend filmsApiClient -> real backend -> faked discovery agent', () => {
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

    // The queue worker is deliberately not started by createApp() (see docs/adr/0018) —
    // driven here explicitly, one job at a time, against the same store instances.
    worker = createDiscoveryQueueWorker({ discoveryJobStore, filmStore, discoveryAgent, mockDiscoveryAgent: discoveryAgent, eventBus });
  });

  afterAll(async () => {
    await backend.close();
  });

  it('imports a film end-to-end (upload video+subtitle, create, prep pipeline) and reaches "ready"', async () => {
    // No fetchImpl override anywhere in this file — real fetch, real TCP, real Express app.
    const { videoUrl } = await uploadVideoFile(
      new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' }),
      { passcode: TEST_PASSCODE, testMode: true },
      { baseUrl: backend.url },
    );
    // Mock mode saves to local disk and serves it back over HTTP — not GCS.
    expect(videoUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mock-uploads\/.+\.mp4\?passcode=/);

    const { subtitleUrl, format, entries } = await uploadSubtitleFile(
      new File([SRT], 'clip.srt', { type: 'text/plain' }),
      { passcode: TEST_PASSCODE, testMode: true },
      { baseUrl: backend.url },
    );
    expect(entries).toHaveLength(1);

    const film = await createFilm(
      {
        passcode: TEST_PASSCODE,
        title: 'Integration Film',
        videoUrl,
        subtitleUrl,
        subtitleFormat: format,
        subtitleEntries: entries,
        runDiscovery: false,
        testMode: true,
      },
      { baseUrl: backend.url },
    );
    expect(film.subtitle?.entries).toHaveLength(1);

    const events: FilmPrepStreamEvent[] = [];
    await streamFilmPrep(film.id, TEST_PASSCODE, (e) => events.push(e), { baseUrl: backend.url });
    expect(events.at(-1)?.prep.stage).toBe('ready');

    // ---- Kick off a discovery pass, drive the worker, merge its finding ----
    const job = await createDiscoveryJob(
      film.id,
      { passcode: TEST_PASSCODE, specialInstruction: 'find something', targetColumns: ['segmentDescription'], testMode: true },
      { baseUrl: backend.url },
    );
    expect(job.status).toBe('queued');

    expect(await worker.processOne()).toBe(true);

    const jobEvents: DiscoveryJobStreamEvent[] = [];
    await streamDiscoveryJob(film.id, job.id, TEST_PASSCODE, (e) => jobEvents.push(e), { baseUrl: backend.url });
    const finalJob = jobEvents.at(-1)!.job;
    expect(finalJob.status).toBe('done');
    expect(finalJob.resultRows).toHaveLength(1);

    const mergedRow = await mergeDiscoveryResult(film.id, job.id, finalJob.resultRows[0].tempId, TEST_PASSCODE, { baseUrl: backend.url });
    expect(mergedRow.provenance).toMatchObject({ type: 'agent-discovered' });

    const details = await listDetails(film.id, TEST_PASSCODE, { baseUrl: backend.url });
    expect(details.rows).toHaveLength(1);
  });

  it('rejects film creation with an error when the passcode is wrong', async () => {
    await expect(
      createFilm(
        {
          passcode: 'wrong',
          title: 'X',
          videoUrl: 'gs://bucket/x.mp4',
          subtitleUrl: 'gs://bucket/x.srt',
          subtitleFormat: 'srt',
          subtitleEntries: [{ id: 'e1', index: 0, startMs: 0, endMs: 1000, text: 'hi' }],
          runDiscovery: false,
          testMode: true,
        },
        { baseUrl: backend.url },
      ),
    ).rejects.toThrow(/401/);
  });
});

describe('frontend filmsApiClient -> real backend -> real chunked upload to a faked GCS endpoint (real/non-mock mode)', () => {
  it('uploads a video directly to the GCS resumable session, bypassing the backend for the video bytes', async () => {
    // The only fake here is videoBucketUploader (the external Google client) —
    // everything else, including the multi-chunk PUT protocol in
    // resumableUpload.ts AND the finalize confirmation step, runs for real
    // over a real TCP hop. getObjectSizeBytes reads from the fake server's own
    // byte count, standing in for GCS's real object metadata.
    const gcs = await startFakeGcsResumableServer();
    const createResumableUploadSession = vi
      .fn()
      .mockImplementation(async ({ filename }: { filename: string }) => ({
        uploadUrl: gcs.url,
        videoUrl: `gs://fake-bucket/${filename}`,
      }));
    const getObjectSizeBytes = vi.fn().mockImplementation(async () => gcs.receivedBytes());

    const backend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000, mockDelayScale: 0.01 },
      videoBucketUploader: { uploadFromUrl: vi.fn(), uploadBuffer: vi.fn(), createResumableUploadSession, getObjectSizeBytes, deleteObject: vi.fn() },
    });

    try {
      // Big enough to span multiple 8MiB chunks in resumableUpload.ts.
      const bytes = new Uint8Array(9 * 1024 * 1024);
      const { videoUrl } = await uploadVideoFile(
        new File([bytes], 'big-clip.mp4', { type: 'video/mp4' }),
        { passcode: TEST_PASSCODE, testMode: false },
        { baseUrl: backend.url },
      );

      expect(videoUrl).toBe('gs://fake-bucket/big-clip.mp4');
      expect(gcs.receivedBytes()).toBe(bytes.length);
      expect(createResumableUploadSession).toHaveBeenCalledWith({ filename: 'big-clip.mp4', contentType: 'video/mp4' });
    } finally {
      await backend.close();
      await gcs.close();
    }
  });

  it('still succeeds when the completing response is unreadable — the real GCS bug this whole flow exists to survive', async () => {
    const gcs = await startFakeGcsResumableServer({ dropFinalResponse: true });
    const createResumableUploadSession = vi
      .fn()
      .mockImplementation(async ({ filename }: { filename: string }) => ({
        uploadUrl: gcs.url,
        videoUrl: `gs://fake-bucket/${filename}`,
      }));
    const getObjectSizeBytes = vi.fn().mockImplementation(async () => gcs.receivedBytes());

    const backend = await startTestBackend({
      config: { sharedPasscode: TEST_PASSCODE, rateLimitWindowMs: 60_000, rateLimitMax: 1000, mockDelayScale: 0.01 },
      videoBucketUploader: { uploadFromUrl: vi.fn(), uploadBuffer: vi.fn(), createResumableUploadSession, getObjectSizeBytes, deleteObject: vi.fn() },
    });

    try {
      const bytes = new Uint8Array(9 * 1024 * 1024);
      const { videoUrl } = await uploadVideoFile(
        new File([bytes], 'dropped-final.mp4', { type: 'video/mp4' }),
        { passcode: TEST_PASSCODE, testMode: false },
        { baseUrl: backend.url },
      );

      // No thrown error despite the completing response being unreadable —
      // the bytes still landed, and /finalize confirmed it via the backend.
      expect(videoUrl).toBe('gs://fake-bucket/dropped-final.mp4');
      expect(gcs.receivedBytes()).toBe(bytes.length);
    } finally {
      await backend.close();
      await gcs.close();
    }
  });
});
