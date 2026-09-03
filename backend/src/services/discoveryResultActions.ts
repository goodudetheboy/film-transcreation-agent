import type { DetailRow } from './filmTypes.js';
import type { DetailRowsStore } from './detailRowsStore.js';
import type { DiscoveryJobStore } from './discoveryJobStore.js';
import type { DiscoveryEventBus } from './discoveryEventBus.js';

export interface DiscoveryResultActionsDeps {
  discoveryJobStore: DiscoveryJobStore;
  detailRowsStore: DetailRowsStore;
  eventBus: DiscoveryEventBus;
}

export type DiscoveryResultActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Accepts one of a job's candidate rows into the film's Details table.
 * Shared by the manual "Add" button route (routes/films.ts) and the
 * discovery chat agent's merge_candidate_row tool (discoveryChatAgent.ts) —
 * both need the exact same effect, so this is the one place that has it.
 */
export async function mergeDiscoveryResult(
  deps: DiscoveryResultActionsDeps,
  filmId: string,
  jobId: string,
  resultRowId: string,
): Promise<DiscoveryResultActionResult<DetailRow>> {
  const job = await deps.discoveryJobStore.getJob(filmId, jobId);
  if (!job) return { ok: false, error: 'discovery job not found' };
  const result = job.resultRows.find((r) => r.tempId === resultRowId);
  if (!result) return { ok: false, error: 'result row not found' };

  const row = await deps.detailRowsStore.addRow(job.filmId, {
    startMs: result.startMs,
    endMs: result.endMs,
    subtitleText: result.subtitleText,
    values: {
      segmentDescription: result.values.segmentDescription,
      gesture: result.values.gesture,
      notes: result.values.notes,
      custom: result.values.custom,
    },
    provenance: { type: 'agent-discovered', jobId: job.id, agentNumber: job.agentNumber, passNumber: job.passNumber },
  });

  const updatedJob = await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
    resultRows: job.resultRows.filter((r) => r.tempId !== result.tempId),
  });
  if (updatedJob) deps.eventBus.publish(`discoveryJob:${job.id}`, { type: 'job_update', job: updatedJob });

  return { ok: true, value: row };
}

/** Discards one of a job's candidate rows — never touches the Details table,
 * only removes it from the job's pending resultRows. */
export async function discardDiscoveryResult(
  deps: DiscoveryResultActionsDeps,
  filmId: string,
  jobId: string,
  resultRowId: string,
): Promise<DiscoveryResultActionResult<void>> {
  const job = await deps.discoveryJobStore.getJob(filmId, jobId);
  if (!job) return { ok: false, error: 'discovery job not found' };
  if (!job.resultRows.some((r) => r.tempId === resultRowId)) return { ok: false, error: 'result row not found' };

  const updatedJob = await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
    resultRows: job.resultRows.filter((r) => r.tempId !== resultRowId),
  });
  if (updatedJob) deps.eventBus.publish(`discoveryJob:${job.id}`, { type: 'job_update', job: updatedJob });

  return { ok: true, value: undefined };
}
