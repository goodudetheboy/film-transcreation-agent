import { useEffect, useState } from 'react';
import { BUILTIN_COLUMN_LABELS, type ColumnDoc, type DetailRow, type DiscoveryJob } from '../api/apiClient.types';
import { commentOnDiscoveryJob, discardDiscoveryResult, mergeDiscoveryResult, streamDiscoveryJob } from '../api/filmsApiClient';

export interface AgentStatusPanelProps {
  filmId: string;
  passcode: string;
  jobId: string;
  /** The last-known full detail for jobId, if any has arrived yet (from the
   * workspace store's jobDetails cache) — may be undefined on first open. */
  job: DiscoveryJob | undefined;
  columns: ColumnDoc[];
  onJobEvent: (event: { type: 'job_update'; job: DiscoveryJob }) => void;
  onRowMerged: (row: DetailRow) => void;
}

function columnLabel(key: string, columns: ColumnDoc[]): string {
  if (key in BUILTIN_COLUMN_LABELS) return BUILTIN_COLUMN_LABELS[key as keyof typeof BUILTIN_COLUMN_LABELS];
  return columns.find((c) => c.key === key)?.name ?? key;
}

export function AgentStatusPanel({ filmId, passcode, jobId, job, columns, onJobEvent, onRowMerged }: AgentStatusPanelProps) {
  const [comment, setComment] = useState('');
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // streamDiscoveryJob's endpoint replays the job's current state as its first
    // frame then follows live (docs/adr/0020) — this alone both bootstraps a
    // never-before-seen job's detail AND keeps it live, no separate fetch needed.
    streamDiscoveryJob(filmId, jobId, passcode, (event) => {
      if (!cancelled) onJobEvent(event);
    });
    return () => {
      cancelled = true;
    };
    // Re-subscribing on job?.status (not just jobId) matters for the comment-driven
    // re-run flow: a comment re-queues the SAME job id, and the previous stream
    // already closed on its first 'done'/'error' — only a status change back to
    // 'queued' tells us there's a new run to follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmId, jobId, job?.status, passcode]);

  if (!job) return <p className="results-placeholder">Loading pass…</p>;

  const isRunning = job.status === 'queued' || job.status === 'running';

  async function handleMerge(resultRowId: string) {
    if (!job) return;
    setBusyRowId(resultRowId);
    setError(null);
    try {
      const row = await mergeDiscoveryResult(filmId, job.id, resultRowId, passcode);
      onRowMerged(row);
      onJobEvent({ type: 'job_update', job: { ...job, resultRows: job.resultRows.filter((r) => r.tempId !== resultRowId) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add row');
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleDiscard(resultRowId: string) {
    if (!job) return;
    setBusyRowId(resultRowId);
    setError(null);
    try {
      await discardDiscoveryResult(filmId, job.id, resultRowId, passcode);
      onJobEvent({ type: 'job_update', job: { ...job, resultRows: job.resultRows.filter((r) => r.tempId !== resultRowId) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to discard row');
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleComment() {
    if (!job || comment.trim() === '') return;
    setCommenting(true);
    setError(null);
    try {
      const updated = await commentOnDiscoveryJob(filmId, job.id, { passcode, comment });
      onJobEvent({ type: 'job_update', job: updated });
      setComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to re-run agent');
    } finally {
      setCommenting(false);
    }
  }

  return (
    <div className="agent-panel">
      <div className="page-header__heading">
        <p className="content-card__primary">
          Agent #{job.agentNumber} · Pass #{job.passNumber} — {job.status}
        </p>
        <p className="content-card__secondary">{job.specialInstruction || <em>No special instruction</em>}</p>
        <p className="content-card__caption">Columns: {job.targetColumns.map((c) => columnLabel(c, columns)).join(', ')}</p>
      </div>

      {isRunning && (
        <p className="results-status" role="status">
          Working…
        </p>
      )}

      <ul className="content-list agent-log">
        {job.log.map((entry, i) => (
          <li key={i} className="content-card__caption">
            {new Date(entry.ts).toLocaleTimeString()} — {entry.message}
          </li>
        ))}
      </ul>

      {job.status === 'error' && <p className="passcode-gate__error">{job.errorMessage}</p>}
      {error && <p className="passcode-gate__error">{error}</p>}

      {job.status === 'done' && (
        <>
          <p className="section-heading">Detected details</p>
          {job.resultRows.length === 0 && <p className="results-placeholder">No new candidates this pass.</p>}
          <ul className="content-list">
            {job.resultRows.map((r) => (
              <li key={r.tempId} className="content-card">
                <p className="content-card__caption">{r.timestamp}</p>
                <p className="content-card__primary">“{r.subtitleText}”</p>
                <p className="content-card__secondary">
                  {Object.entries(r.values)
                    .filter(([k]) => k !== 'custom')
                    .map(([k, v]) => `${columnLabel(k, columns)}: ${v}`)
                    .join(' · ')}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button type="button" className="btn btn--primary" disabled={busyRowId === r.tempId} onClick={() => handleMerge(r.tempId)}>
                    Add
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={busyRowId === r.tempId} onClick={() => handleDiscard(r.tempId)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="field">
            <label htmlFor="agent-comment">Not happy? Comment here and kick off agent again taking into your comments</label>
            <input id="agent-comment" type="text" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <button type="button" className="btn btn--primary" disabled={commenting || comment.trim() === ''} onClick={handleComment}>
            {commenting ? 'Kicking off…' : 'Kick off agent'}
          </button>
        </>
      )}
    </div>
  );
}
