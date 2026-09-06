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

/**
 * Bulk sibling of mergeDiscoveryResult — one getJob, one bulk DetailRow
 * create (DetailRowsStore.addRows), and one updateJob regardless of how many
 * tempIds are accepted, instead of a client-side loop over the singular
 * per-row action doing N read-modify-writes against the same job doc.
 */
export async function mergeDiscoveryResults(
  deps: DiscoveryResultActionsDeps,
  filmId: string,
  jobId: string,
  resultRowIds: string[],
): Promise<DiscoveryResultActionResult<DetailRow[]>> {
  const job = await deps.discoveryJobStore.getJob(filmId, jobId);
  if (!job) return { ok: false, error: 'discovery job not found' };

  const idSet = new Set(resultRowIds);
  const toMerge = job.resultRows.filter((r) => idSet.has(r.tempId));
  if (toMerge.length === 0) return { ok: false, error: 'no matching result rows' };

  const rows = await deps.detailRowsStore.addRows(
    job.filmId,
    toMerge.map((result) => ({
      startMs: result.startMs,
      endMs: result.endMs,
      subtitleText: result.subtitleText,
      values: {
        segmentDescription: result.values.segmentDescription,
        gesture: result.values.gesture,
        notes: result.values.notes,
        custom: result.values.custom,
      },
      provenance: { type: 'agent-discovered' as const, jobId: job.id, agentNumber: job.agentNumber, passNumber: job.passNumber },
    })),
  );

  const mergedIds = new Set(toMerge.map((r) => r.tempId));
  const updatedJob = await deps.discoveryJobStore.updateJob(job.filmId, job.id, {
    resultRows: job.resultRows.filter((r) => !mergedIds.has(r.tempId)),
  });
  if (updatedJob) deps.eventBus.publish(`discoveryJob:${job.id}`, { type: 'job_update', job: updatedJob });

  return { ok: true, value: rows };
}

/** Bulk sibling of discardDiscoveryResult — one getJob, one updateJob. */
export async function discardDiscoveryResults(
  deps: DiscoveryResultActionsDeps,
  filmId: string,
  jobId: string,
  resultRowIds: string[],
): Promise<DiscoveryResultActionResult<void>> {
  const job = await deps.discoveryJobStore.getJob(filmId, jobId);
  if (!job) return { ok: false, error: 'discovery job not found' };

  const idSet = new Set(resultRowIds);
  const remaining = job.resultRows.filter((r) => !idSet.has(r.tempId));
  if (remaining.length === job.resultRows.length) return { ok: false, error: 'no matching result rows' };

  const updatedJob = await deps.discoveryJobStore.updateJob(job.filmId, job.id, { resultRows: remaining });
  if (updatedJob) deps.eventBus.publish(`discoveryJob:${job.id}`, { type: 'job_update', job: updatedJob });

  return { ok: true, value: undefined };
}
