import type { DiscoveryAgent } from './discoveryAgent.js';
import type { DiscoveryEventBus } from './discoveryEventBus.js';
import type { DiscoveryJobStore } from './discoveryJobStore.js';
import type { FilmStore } from './filmStore.js';

export interface DiscoveryQueueWorkerDeps {
  discoveryJobStore: DiscoveryJobStore;
  filmStore: FilmStore;
  discoveryAgent: DiscoveryAgent;
  mockDiscoveryAgent: DiscoveryAgent;
  eventBus: DiscoveryEventBus;
  pollIntervalMs?: number;
}

export interface DiscoveryQueueWorker {
  start(): void;
  stop(): void;
  /** Processes at most one queued job, returning whether it found one — used directly by tests instead of the polling loop. */
  processOne(): Promise<boolean>;
}

function jobChannel(jobId: string): string {
  return `discoveryJob:${jobId}`;
}

/**
 * Drains discoveryJobs' `status: 'queued'` documents one at a time, across
 * every film — the "queued, not parallel" pass-concurrency decision, so
 * multiple kicked-off passes never run N simultaneous Gemini calls. See
 * docs/adr/0020 for why the live status this produces is pushed via
 * discoveryEventBus rather than a client-side Firestore listener.
 */
export function createDiscoveryQueueWorker(deps: DiscoveryQueueWorkerDeps): DiscoveryQueueWorker {
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pollIntervalMs = deps.pollIntervalMs ?? 1000;

  async function processOne(): Promise<boolean> {
    const job = await deps.discoveryJobStore.claimNextQueuedJob();
    if (!job) return false;
    deps.eventBus.publish(jobChannel(job.id), { type: 'job_update', job });

    try {
      const film = await deps.filmStore.getFilm(job.filmId);
      if (!film) throw new Error(`film ${job.filmId} not found`);
      if (!film.subtitle) throw new Error(`film ${job.filmId} has no parsed subtitle to anchor findings to`);

      const agent = job.testMode ? deps.mockDiscoveryAgent : deps.discoveryAgent;
      const isRerun = job.conversationHistory.length > 0;
      const latestComment = job.commentHistory[job.commentHistory.length - 1]?.comment;

      const started = new Date().toISOString();
      const running1 = await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
        log: [
          ...job.log,
          { ts: started, message: isRerun ? 'Re-running with your comment…' : 'Calling the Discovery agent…' },
        ],
      });
      if (running1) deps.eventBus.publish(jobChannel(job.id), { type: 'job_update', job: running1 });

      const result = await agent.runPass({
        videoUrl: film.videoUrl,
        subtitleEntries: film.subtitle.entries,
        specialInstruction: job.specialInstruction,
        targetColumns: job.targetColumns,
        priorConversation: job.conversationHistory,
        newComment: isRerun ? latestComment : undefined,
      });

      const now = new Date().toISOString();
      const finished = await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
        status: 'done',
        finishedAt: now,
        resultRows: result.resultRows,
        conversationHistory: result.updatedConversation,
        log: [
          ...(running1?.log ?? job.log),
          { ts: now, message: `Found ${result.resultRows.length} candidate row(s).` },
        ],
      });
      if (finished) deps.eventBus.publish(jobChannel(job.id), { type: 'job_update', job: finished });
    } catch (err) {
      const now = new Date().toISOString();
      const message = err instanceof Error ? err.message : 'unknown error';
      const errored = await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
        status: 'error',
        finishedAt: now,
        errorMessage: message,
        log: [...job.log, { ts: now, message: `Error: ${message}` }],
      });
      if (errored) deps.eventBus.publish(jobChannel(job.id), { type: 'job_update', job: errored });
    }

    return true;
  }

  async function loop(): Promise<void> {
    if (!running) return;
    try {
      await processOne();
    } catch {
      // A bad claim/update shouldn't kill the loop — the next tick tries again.
    }
    if (running) timer = setTimeout(loop, pollIntervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      void deps.discoveryJobStore.resetStaleRunningJobs().then(loop);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
    },
    processOne,
  };
}
