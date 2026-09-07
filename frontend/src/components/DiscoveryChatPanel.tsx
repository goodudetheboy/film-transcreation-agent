import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  createDiscoveryAgentSession,
  deleteDiscoveryAgentSession,
  listDiscoveryAgentSessions,
  logDiscoveryRun,
  renameDiscoveryAgentSession,
  sendDiscoveryChatMessage,
} from '../api/discoveryChatApiClient';
import {
  bulkDiscardDiscoveryResults,
  bulkMergeDiscoveryResults,
  createDiscoveryJob,
  discardDiscoveryResult,
  mergeDiscoveryResult,
  streamDiscoveryJob,
} from '../api/filmsApiClient';
import { BUILTIN_COLUMN_LABELS } from '../api/apiClient.types';
import type {
  ColumnDoc,
  DiscoveryAgentSession,
  DiscoveryChatStreamEvent,
  DiscoveryChatTurn,
  DiscoveryJob,
} from '../api/apiClient.types';
import { useFilmWorkspaceStore } from '../store/filmWorkspaceStore';
import { formatClock } from '../utils/timeFormat';
import { useResizableColumns } from '../utils/useResizableColumns';
import { detailRowReference, type ChatReference } from '../utils/chatReferences';
import type { VideoSelection } from './VideoScrubber';
import { CheckIcon, SparkleIcon, TrashIcon } from './icons';
import { ConfirmModal } from './ConfirmModal';
import { EditableTitle } from './EditableTitle';
import { ChatMarkdown } from './ChatMarkdown';
import { Modal } from './Modal';
import { ResizableTh } from './ResizableTh';
import { MentionComposeInput, type MentionComposeInputHandle } from './MentionComposeInput';
import { MessageWithReferences } from './MessageWithReferences';

export interface DiscoveryChatPanelProps {
  filmId: string;
  passcode: string;
  testMode: boolean;
  columns: ColumnDoc[];
  /** Deep-link from the global Agents tab — opens this specific session's
   * chat instead of the library view, once. */
  initialAgentId?: string;
  /** Deep-link from the global Agents tab's create-flow picker — fires the
   * matching create handler once, instead of landing on the library view. */
  initialAutoCreate?: 'agent' | 'session';
  /** The scrubber's current marked in/out range, if any — offered as a
   * "Current video selection" pick in the @ dropdown and via drag-and-drop
   * from the scrubber itself. */
  videoSelection?: VideoSelection | null;
}

const QUICK_PROMPTS = [
  'What did this run find?',
  'Fix any typos you see in the segment descriptions.',
  'Which candidate is the most interesting?',
];

const DEFAULT_COLUMNS = ['segmentDescription', 'gesture'];

// Same shape/defaults as DetailsTable.tsx's own column widths — checkbox/actions
// aren't user-resizable (no ResizableTh rendered for them), matching how that
// table's trailing actions column is sized but not draggable either.
const RESULT_COL_WIDTHS: Record<string, number> = {
  checkbox: 36,
  start: 90,
  end: 90,
  subtitle: 260,
  segmentDescription: 260,
  gesture: 170,
  notes: 220,
  actions: 130,
};
const RESULT_DEFAULT_CUSTOM_WIDTH = 200;
const RESULT_MIN_COL_WIDTH = 60;
const RESULT_MAX_COL_WIDTH = 640;

/** The inline kickoff form — same fields AgentKickoffPanel used to show in a
 * modal, minus the agent picker (we're always already inside one). Shown
 * automatically for a brand-new empty agent, or on demand via "Kick off
 * another pass" for a later run. */
function KickoffForm({
  filmId,
  passcode,
  testMode,
  agentNumber,
  columns,
  onCreated,
  onCancel,
}: {
  filmId: string;
  passcode: string;
  testMode: boolean;
  agentNumber: number;
  columns: ColumnDoc[];
  onCreated: (session: DiscoveryAgentSession) => void;
  onCancel?: () => void;
}) {
  const { activeDiscoveryChatSessionId } = useFilmWorkspaceStore();
  const [name, setName] = useState('');
  const [specialInstruction, setSpecialInstruction] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allColumns = [
    ...Object.entries(BUILTIN_COLUMN_LABELS).map(([key, label]) => ({ key, label })),
    ...columns.map((c) => ({ key: c.key, label: c.name })),
  ];

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedColumns.length === 0 || !activeDiscoveryChatSessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await createDiscoveryJob(filmId, {
        passcode,
        agentNumber,
        name: name.trim() || undefined,
        specialInstruction,
        targetColumns: selectedColumns,
        testMode,
      });
      const session = await logDiscoveryRun(filmId, activeDiscoveryChatSessionId, { passcode, jobId: job.id });
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to kick off agent');
      setSubmitting(false);
    }
  }

  return (
    <form className="agent-kickoff-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="discovery-run-name">Label (optional)</label>
        <input id="discovery-run-name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
      </div>

      <div className="field">
        <label htmlFor="discovery-run-instruction">Special instruction</label>
        <textarea
          id="discovery-run-instruction"
          className="field__textarea--compact"
          rows={3}
          placeholder="Focus on the first half, second half, …"
          value={specialInstruction}
          onChange={(e) => setSpecialInstruction(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="field">
        <label>Metadata column for AI agent to add more details?</label>
        <div className="column-checklist">
          {allColumns.map((c) => (
            <label key={c.key} className="checkbox-field">
              <input type="checkbox" checked={selectedColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} disabled={submitting} />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="submit" className="btn btn--primary" disabled={submitting || selectedColumns.length === 0}>
          {submitting ? 'Kicking off…' : 'Kick off agent'}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** The full list of a run's candidates — a checkbox table (leftmost
 * select-all-then-act column) inside a modal, opened from the count badge on
 * a done DiscoveryRunCard instead of dumping every row into the chat thread. */
function DiscoveryResultsModal({
  job,
  columns,
  onMergeOne,
  onDiscardOne,
  onBulkMerge,
  onBulkDiscard,
  onClose,
}: {
  job: DiscoveryJob;
  columns: ColumnDoc[];
  onMergeOne: (tempId: string) => Promise<void>;
  onDiscardOne: (tempId: string) => Promise<void>;
  onBulkMerge: (tempIds: string[]) => Promise<void>;
  onBulkDiscard: (tempIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyTempId, setBusyTempId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<{ tempId: string; subtitleText: string } | null>(null);
  const [confirmBulkDiscard, setConfirmBulkDiscard] = useState(false);
  const [viewingTempId, setViewingTempId] = useState<string | null>(null);
  const viewingCandidate = viewingTempId ? job.resultRows.find((r) => r.tempId === viewingTempId) : undefined;
  const { colWidth, resizerHandlers } = useResizableColumns(
    RESULT_COL_WIDTHS,
    RESULT_DEFAULT_CUSTOM_WIDTH,
    RESULT_MIN_COL_WIDTH,
    RESULT_MAX_COL_WIDTH,
  );

  // Drop any selected tempId once its candidate is gone (merged/discarded,
  // by this modal or by the chat agent's own tools) — otherwise a stale id
  // could ride along into a later bulk call.
  useEffect(() => {
    setSelected((prev) => {
      const stillPresent = new Set(job.resultRows.map((r) => r.tempId));
      const next = new Set([...prev].filter((id) => stillPresent.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [job.resultRows]);

  function toggle(tempId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === job.resultRows.length ? new Set() : new Set(job.resultRows.map((r) => r.tempId))));
  }

  async function handleMerge(tempId: string) {
    setBusyTempId(tempId);
    try {
      await onMergeOne(tempId);
      setViewingTempId((prev) => (prev === tempId ? null : prev));
    } finally {
      setBusyTempId(null);
    }
  }

  async function handleDiscardConfirmed() {
    if (!discardTarget) return;
    const { tempId } = discardTarget;
    setBusyTempId(tempId);
    try {
      await onDiscardOne(tempId);
      setDiscardTarget(null);
      setViewingTempId((prev) => (prev === tempId ? null : prev));
    } finally {
      setBusyTempId(null);
    }
  }

  async function handleBulkMerge() {
    setBulkBusy(true);
    try {
      await onBulkMerge([...selected]);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDiscardConfirmed() {
    setBulkBusy(true);
    try {
      await onBulkDiscard([...selected]);
      setConfirmBulkDiscard(false);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <Modal
      title={`${job.resultRows.length} detail${job.resultRows.length === 1 ? '' : 's'} found — Run #${job.passNumber}`}
      onClose={onClose}
      className="discovery-results-modal"
    >
      {job.resultRows.length === 0 ? (
        <p className="results-placeholder">All candidates handled.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn btn--primary" disabled={selected.size === 0 || bulkBusy} onClick={handleBulkMerge}>
              Add {selected.size || ''} selected
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => setConfirmBulkDiscard(true)}
            >
              Discard {selected.size || ''} selected
            </button>
          </div>

          <div className="details-table-wrap details-table-wrap--standalone">
            <div className="details-table-scroll">
              <table className="details-table">
                <colgroup>
                  <col style={{ width: colWidth('checkbox') }} />
                  <col style={{ width: colWidth('start') }} />
                  <col style={{ width: colWidth('end') }} />
                  <col style={{ width: colWidth('subtitle') }} />
                  <col style={{ width: colWidth('segmentDescription') }} />
                  <col style={{ width: colWidth('gesture') }} />
                  <col style={{ width: colWidth('notes') }} />
                  {columns.map((c) => (
                    <col key={c.id} style={{ width: colWidth(c.key) }} />
                  ))}
                  <col style={{ width: colWidth('actions') }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selected.size === job.resultRows.length}
                        onChange={toggleAll}
                        aria-label={selected.size === job.resultRows.length ? 'Deselect all candidates' : 'Select all candidates'}
                      />
                    </th>
                    <ResizableTh colKey="start" {...resizerHandlers}>Start</ResizableTh>
                    <ResizableTh colKey="end" {...resizerHandlers}>End</ResizableTh>
                    <ResizableTh colKey="subtitle" {...resizerHandlers}>Subtitle</ResizableTh>
                    <ResizableTh colKey="segmentDescription" {...resizerHandlers}>Segment Description</ResizableTh>
                    <ResizableTh colKey="gesture" {...resizerHandlers}>Gesture</ResizableTh>
                    <ResizableTh colKey="notes" {...resizerHandlers}>Notes</ResizableTh>
                    {columns.map((c) => (
                      <ResizableTh key={c.id} colKey={c.key} title={c.description || undefined} {...resizerHandlers}>
                        {c.name}
                      </ResizableTh>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {job.resultRows.map((r) => (
                    <tr key={r.tempId} onClick={() => setViewingTempId(r.tempId)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.tempId)}
                          onChange={() => toggle(r.tempId)}
                          aria-label={`Select candidate at ${formatClock(r.startMs)}`}
                        />
                      </td>
                      <td title={formatClock(r.startMs)}>{formatClock(r.startMs)}</td>
                      <td title={formatClock(r.endMs)}>{formatClock(r.endMs)}</td>
                      <td title={r.subtitleText}>{r.subtitleText || <em>Visual only</em>}</td>
                      <td title={r.values.segmentDescription}>{r.values.segmentDescription}</td>
                      <td title={r.values.gesture}>{r.values.gesture}</td>
                      <td title={r.values.notes}>{r.values.notes}</td>
                      {columns.map((c) => (
                        <td key={c.id} title={r.values.custom?.[c.key] ?? ''}>
                          {r.values.custom?.[c.key] ?? ''}
                        </td>
                      ))}
                      <td className="details-table__cell--nowrap-exempt" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="btn btn--primary" disabled={busyTempId === r.tempId} onClick={() => handleMerge(r.tempId)}>
                            Add
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={busyTempId === r.tempId}
                            onClick={() => setDiscardTarget({ tempId: r.tempId, subtitleText: r.subtitleText })}
                            aria-label="Discard candidate"
                            title="Discard candidate"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Clicking a candidate row opens its full detail here — same Add/Discard
          actions as the row itself, just easier to read at a glance. */}
      {viewingCandidate && (
        <Modal
          title={`${formatClock(viewingCandidate.startMs)}–${formatClock(viewingCandidate.endMs)}`}
          onClose={() => setViewingTempId(null)}
        >
          <p className="content-card__primary">&ldquo;{viewingCandidate.subtitleText || 'Visual only'}&rdquo;</p>
          <div className="field">
            <label>Segment Description</label>
            <p>{viewingCandidate.values.segmentDescription || '—'}</p>
          </div>
          <div className="field">
            <label>Gesture</label>
            <p>{viewingCandidate.values.gesture || '—'}</p>
          </div>
          <div className="field">
            <label>Notes</label>
            <p>{viewingCandidate.values.notes || '—'}</p>
          </div>
          {columns.map((c) => (
            <div className="field" key={c.id}>
              <label>{c.name}</label>
              <p>{viewingCandidate.values.custom?.[c.key] || '—'}</p>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busyTempId === viewingCandidate.tempId}
              onClick={() => handleMerge(viewingCandidate.tempId)}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busyTempId === viewingCandidate.tempId}
              onClick={() => setDiscardTarget({ tempId: viewingCandidate.tempId, subtitleText: viewingCandidate.subtitleText })}
            >
              <TrashIcon /> Discard
            </button>
          </div>
        </Modal>
      )}

      {discardTarget && (
        <ConfirmModal
          title="Discard this candidate?"
          body={`"${discardTarget.subtitleText}" will be dropped from this run's suggestions. This can't be undone.`}
          confirmLabel="Discard"
          busy={busyTempId === discardTarget.tempId}
          onConfirm={handleDiscardConfirmed}
          onCancel={() => setDiscardTarget(null)}
        />
      )}

      {confirmBulkDiscard && (
        <ConfirmModal
          title="Discard these candidates?"
          body={`${selected.size} candidate${selected.size === 1 ? '' : 's'} will be dropped from this run's suggestions. This can't be undone.`}
          confirmLabel="Discard"
          busy={bulkBusy}
          onConfirm={handleBulkDiscardConfirmed}
          onCancel={() => setConfirmBulkDiscard(false)}
        />
      )}
    </Modal>
  );
}

/** One run (DiscoveryJob pass), inline in the thread — the same content
 * AgentStatusPanel used to show as its own panel, restyled as a card. */
function DiscoveryRunCard({
  job,
  columns,
  onMerge,
  onDiscard,
  onBulkMerge,
  onBulkDiscard,
}: {
  job: DiscoveryJob | undefined;
  columns: ColumnDoc[];
  onMerge: (jobId: string, tempId: string) => Promise<void>;
  onDiscard: (jobId: string, tempId: string) => Promise<void>;
  onBulkMerge: (jobId: string, tempIds: string[]) => Promise<void>;
  onBulkDiscard: (jobId: string, tempIds: string[]) => Promise<void>;
}) {
  const [showResults, setShowResults] = useState(false);

  if (!job) return <div className="agent-run-card results-placeholder">Loading run…</div>;

  const currentJob = job;
  const isRunning = currentJob.status === 'queued' || currentJob.status === 'running';

  return (
    <div className="agent-run-card">
      <div className="agent-run-card__header">
        <p className="content-card__primary">
          Run #{currentJob.passNumber} — {currentJob.status}
        </p>
        <p className="content-card__secondary">{currentJob.specialInstruction || <em>No special instruction</em>}</p>
      </div>

      {isRunning && (
        <p className="results-status" role="status">
          Working…
        </p>
      )}
      {job.status === 'error' && <p className="passcode-gate__error">{job.errorMessage}</p>}

      {job.status === 'done' && (
        <>
          {job.resultRows.length === 0 ? (
            <p className="results-placeholder">No new candidates this pass.</p>
          ) : (
            <button type="button" className="run-result-badge" onClick={() => setShowResults(true)}>
              <SparkleIcon width={14} height={14} /> {job.resultRows.length} detail{job.resultRows.length === 1 ? '' : 's'} found
            </button>
          )}
        </>
      )}

      {showResults && (
        <DiscoveryResultsModal
          job={currentJob}
          columns={columns}
          onMergeOne={(tempId) => onMerge(currentJob.id, tempId)}
          onDiscardOne={(tempId) => onDiscard(currentJob.id, tempId)}
          onBulkMerge={(tempIds) => onBulkMerge(currentJob.id, tempIds)}
          onBulkDiscard={(tempIds) => onBulkDiscard(currentJob.id, tempIds)}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}

/** A tool call the agent made (edit/merge/discard) — same idea as
 * ResearchChatPanel's ToolCallCard. */
function DiscoveryToolCallCard({ name, args, result }: { name: string; args: Record<string, unknown>; result?: Record<string, unknown> }) {
  const label =
    name === 'edit_detail_row'
      ? 'Edited a Detail row'
      : name === 'add_detail_row'
        ? 'Added a new Detail row'
        : name === 'delete_detail_row'
          ? 'Deleted a Detail row'
          : name === 'merge_candidate_row'
            ? 'Added a candidate to the Details table'
            : name === 'discard_candidate_row'
              ? 'Discarded a candidate'
              : name === 'describe_video_segment'
                ? `Looking at ${formatClock(Number(args.startMs))}–${formatClock(Number(args.endMs))}`
                : `Called ${name}`;

  return (
    <div className="chat-step-card">
      <p className="chat-step-card__label">
        {result ? (
          <>
            <CheckIcon /> {label}
          </>
        ) : (
          `${label}…`
        )}
      </p>
      {result?.error !== undefined && <p className="passcode-gate__error">{String(result.error)}</p>}
    </div>
  );
}

export function DiscoveryChatPanel({
  filmId,
  passcode,
  testMode,
  columns,
  initialAgentId,
  initialAutoCreate,
  videoSelection,
}: DiscoveryChatPanelProps) {
  const {
    discoveryChatSessions,
    activeDiscoveryChatSessionId,
    setDiscoveryChatSessions,
    upsertDiscoveryChatSession,
    removeDiscoveryChatSession,
    setActiveDiscoveryChatSessionId,
    applyDiscoveryChatEvent,
    addRow,
    rows,
  } = useFilmWorkspaceStore();
  const [panelView, setPanelView] = useState<'library' | 'chat'>('library');
  const composeRef = useRef<MentionComposeInputHandle>(null);
  const [sending, setSending] = useState(false);
  const [liveEvents, setLiveEvents] = useState<DiscoveryChatStreamEvent[]>([]);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKickoffForm, setShowKickoffForm] = useState(false);
  const [jobDetails, setJobDetails] = useState<Record<string, DiscoveryJob>>({});
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryAgentSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const subscribedJobIdsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    subscribedJobIdsRef.current = new Set();
  }, [filmId]);

  useEffect(() => {
    let cancelled = false;
    listDiscoveryAgentSessions(filmId, passcode).then((sessions) => {
      if (!cancelled) setDiscoveryChatSessions(sessions);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmId, passcode]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [liveEvents, activeDiscoveryChatSessionId]);

  // Deep-link from the global Agents tab — open a specific session or fire a
  // create-flow once, instead of landing on the library view.
  useEffect(() => {
    if (initialAgentId) {
      setActiveDiscoveryChatSessionId(initialAgentId);
      setPanelView('chat');
    } else if (initialAutoCreate === 'agent') {
      handleCreateAgent();
    } else if (initialAutoCreate === 'session') {
      handleCreateSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgentId, initialAutoCreate]);

  const activeSession = discoveryChatSessions.find((s) => s.id === activeDiscoveryChatSessionId) ?? null;
  const mentionable = useMemo<ChatReference[]>(() => rows.map(detailRowReference), [rows]);

  // Populate jobDetails for every `run` part in the active session's turns —
  // one-shot per job (streamDiscoveryJob replays the current snapshot then
  // closes for an already-terminal job, or keeps following if still running).
  // Subscriptions are tracked in a ref, not torn down on every re-run of this
  // effect: an unrelated turns.length change (e.g. a chat message sent while
  // a job is still running) must never cancel a still-live subscription, or
  // its eventual terminal event gets dropped into a cancelled closure and the
  // "Working" status sticks until a full reload.
  useEffect(() => {
    if (!activeSession) return;
    const jobIds = activeSession.turns.flatMap((t) => t.parts.filter((p) => p.run).map((p) => p.run!.jobId));
    const toSubscribe = [...new Set(jobIds)].filter((jobId) => !subscribedJobIdsRef.current.has(jobId));
    for (const jobId of toSubscribe) {
      subscribedJobIdsRef.current.add(jobId);
      streamDiscoveryJob(filmId, jobId, passcode, (event) => {
        setJobDetails((prev) => ({ ...prev, [jobId]: event.job }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, filmId, passcode]);

  function removeCandidatesFromJob(jobId: string, tempIds: string[]) {
    const idSet = new Set(tempIds);
    setJobDetails((prev) =>
      prev[jobId] ? { ...prev, [jobId]: { ...prev[jobId], resultRows: prev[jobId].resultRows.filter((r) => !idSet.has(r.tempId)) } } : prev,
    );
  }

  function removeCandidateFromJob(jobId: string, tempId: string) {
    removeCandidatesFromJob(jobId, [tempId]);
  }

  async function handleMergeCandidate(jobId: string, tempId: string) {
    const row = await mergeDiscoveryResult(filmId, jobId, tempId, passcode);
    addRow(row);
    removeCandidateFromJob(jobId, tempId);
  }

  async function handleDiscardCandidate(jobId: string, tempId: string) {
    await discardDiscoveryResult(filmId, jobId, tempId, passcode);
    removeCandidateFromJob(jobId, tempId);
  }

  async function handleBulkMergeCandidates(jobId: string, tempIds: string[]) {
    const rows = await bulkMergeDiscoveryResults(filmId, jobId, tempIds, passcode);
    for (const row of rows) addRow(row);
    removeCandidatesFromJob(jobId, tempIds);
  }

  async function handleBulkDiscardCandidates(jobId: string, tempIds: string[]) {
    await bulkDiscardDiscoveryResults(filmId, jobId, tempIds, passcode);
    removeCandidatesFromJob(jobId, tempIds);
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDiscoveryAgentSession(filmId, deleteTarget.id, passcode);
      removeDiscoveryChatSession(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete agent');
    } finally {
      setDeleting(false);
    }
  }

  async function handleRenameAgent(name: string) {
    if (!activeSession) return;
    const session = await renameDiscoveryAgentSession(filmId, activeSession.id, { passcode, name });
    upsertDiscoveryChatSession(session);
  }

  async function handleCreateAgent() {
    const nextAgentNumber = Math.max(0, ...discoveryChatSessions.map((s) => s.agentNumber)) + 1;
    const session = await createDiscoveryAgentSession(filmId, { passcode, name: `Agent #${nextAgentNumber}` });
    upsertDiscoveryChatSession(session);
    setPanelView('chat');
    setShowKickoffForm(true);
  }

  async function handleCreateSession() {
    const session = await createDiscoveryAgentSession(filmId, { passcode, name: 'Session' });
    upsertDiscoveryChatSession(session);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  function openSession(id: string) {
    setActiveDiscoveryChatSessionId(id);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  async function handleSend(text: string) {
    let session = activeSession;
    if (!session) {
      session = await createDiscoveryAgentSession(filmId, { passcode });
      upsertDiscoveryChatSession(session);
    }

    setSending(true);
    setError(null);
    setLiveEvents([]);
    setPendingUserText(text);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      await sendDiscoveryChatMessage(
        filmId,
        session.id,
        { passcode, text, testMode },
        (event) => {
          setLiveEvents((prev) => [...prev, event]);
          applyDiscoveryChatEvent(event);
          if (event.type === 'row_added' || event.type === 'row_discarded') removeCandidateFromJob(event.jobId, event.tempId);
          if (event.type === 'error') setError(event.message);
        },
        { signal: controller.signal },
      );
    } finally {
      const sessions = await listDiscoveryAgentSessions(filmId, passcode);
      setDiscoveryChatSessions(sessions);
      setLiveEvents([]);
      setPendingUserText(null);
      setSending(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  if (panelView === 'library') {
    return (
      <div className="chat-panel">
        <div className="chat-panel__library">
          {discoveryChatSessions.length === 0 && (
            <p className="results-placeholder">No agents yet — kick one off to start finding new lines.</p>
          )}
          {[...discoveryChatSessions].reverse().map((s) => {
            const lastText = [...s.turns].reverse().find((t) => t.parts.some((p) => p.text))?.parts.find((p) => p.text)?.text;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                className="chat-panel__library-item"
                onClick={() => openSession(s.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openSession(s.id)}
              >
                <button
                  type="button"
                  className="chat-panel__library-item-delete"
                  aria-label="Delete agent"
                  title="Delete agent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(s);
                  }}
                >
                  <TrashIcon />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-badge status-badge--${s.status === 'streaming' ? 'running' : s.status === 'error' ? 'error' : 'done'}`}>
                    {s.status === 'streaming' ? 'running' : s.status === 'error' ? 'error' : 'done'}
                  </span>
                  <span className="chat-panel__library-item-name">{s.name ?? `Agent #${s.agentNumber}`}</span>
                </div>
                {lastText && <span className="chat-panel__library-item-preview">{lastText}</span>}
                <span className="chat-panel__library-item-meta">{new Date(s.updatedAt).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
        <div className="chat-panel__create-actions">
          <button type="button" className="btn btn--primary" onClick={handleCreateAgent}>
            <SparkleIcon /> Create Agent
          </button>
          <button type="button" className="btn" onClick={handleCreateSession}>
            + Create Session
          </button>
        </div>
        {deleteTarget && (
          <ConfirmModal
            title="Delete this agent?"
            body={`"${deleteTarget.name ?? `Agent #${deleteTarget.agentNumber}`}" and its whole run history will be permanently removed. This can't be undone.`}
            busy={deleting}
            onConfirm={handleDeleteConfirmed}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <button type="button" className="link-back" onClick={() => setPanelView('library')}>
        ← Library
      </button>

      {activeSession && (
        <EditableTitle
          value={activeSession.name ?? `Agent #${activeSession.agentNumber}`}
          onSave={handleRenameAgent}
        />
      )}

      <div className="chat-panel__thread" ref={threadRef}>
        {activeSession?.turns.map((turn: DiscoveryChatTurn, i) => {
          if (turn.role === 'user' && turn.parts[0]?.functionResponse) return null;
          // Consecutive text parts within one turn are chunks of the same logical
          // message (streamed deltas persisted as separate parts) — merge them into
          // a single bubble instead of rendering one bubble per chunk.
          const groups: Array<{ text?: string; run?: NonNullable<(typeof turn.parts)[number]['run']>; functionCall?: NonNullable<(typeof turn.parts)[number]['functionCall']> }> = [];
          for (const part of turn.parts) {
            if (part.text !== undefined) {
              const last = groups[groups.length - 1];
              if (last && last.text !== undefined) last.text += part.text;
              else groups.push({ text: part.text });
            } else if (part.run) {
              groups.push({ run: part.run });
            } else if (part.functionCall) {
              groups.push({ functionCall: part.functionCall });
            }
          }
          return groups.map((g, gi) => {
            if (g.run) {
              return (
                <DiscoveryRunCard
                  key={`${i}-${gi}`}
                  job={jobDetails[g.run.jobId]}
                  columns={columns}
                  onMerge={handleMergeCandidate}
                  onDiscard={handleDiscardCandidate}
                  onBulkMerge={handleBulkMergeCandidates}
                  onBulkDiscard={handleBulkDiscardCandidates}
                />
              );
            }
            if (g.text !== undefined) {
              const isModel = turn.role !== 'user';
              return (
                <div key={`${i}-${gi}`} className={`chat-bubble chat-bubble--${isModel ? 'model' : 'user'}`}>
                  {isModel ? <ChatMarkdown text={g.text} /> : <MessageWithReferences text={g.text} />}
                </div>
              );
            }
            if (g.functionCall) {
              const nextTurn = activeSession.turns[i + 1];
              const response = nextTurn?.parts.find((p) => p.functionResponse?.name === g.functionCall!.name)?.functionResponse?.response;
              return <DiscoveryToolCallCard key={`${i}-${gi}`} name={g.functionCall.name} args={g.functionCall.args} result={response} />;
            }
            return null;
          });
        })}
        {pendingUserText && (
          <div className="chat-bubble chat-bubble--user">
            <MessageWithReferences text={pendingUserText} />
          </div>
        )}

        {liveEvents.map((event, i) => {
          // Skip a text_delta that's immediately continuing the previous one — it's
          // merged into that bubble below — but keep rendering once a non-delta
          // event has broken the run, so a later reply still starts its own bubble.
          if (event.type === 'text_delta' && liveEvents[i - 1]?.type === 'text_delta') return null;
          if (event.type === 'text_delta') {
            let text = event.text;
            for (let j = i + 1; liveEvents[j]?.type === 'text_delta'; j++) text += (liveEvents[j] as { text: string }).text;
            return <div key={i} className="chat-bubble chat-bubble--model"><ChatMarkdown text={text} /></div>;
          }
          if (event.type === 'tool_call') {
            const result = liveEvents.find((e) => e.type === 'tool_result' && e.callId === event.callId);
            return (
              <DiscoveryToolCallCard
                key={i}
                name={event.name}
                args={event.args}
                result={result && result.type === 'tool_result' ? result.result : undefined}
              />
            );
          }
          return null;
        })}
        {sending && (
          <p className="results-status" role="status">
            Thinking…
          </p>
        )}

        {activeSession && !sending && activeSession.turns.length === 0 && (
          <p className="results-placeholder">
            No passes yet. Kick off agentic discovery to get started, or just send a message below.
          </p>
        )}

        {activeSession && !sending && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowKickoffForm(true)}>
            <SparkleIcon /> {activeSession.turns.length === 0 ? 'Kick off agentic discovery' : 'Kick off another pass'}
          </button>
        )}
      </div>

      {showKickoffForm && activeSession && (
        <Modal title="Kick off Discover agent to find new lines?" onClose={() => setShowKickoffForm(false)} className="kickoff-modal">
          <KickoffForm
            filmId={filmId}
            passcode={passcode}
            testMode={testMode}
            agentNumber={activeSession.agentNumber}
            columns={columns}
            onCreated={(s) => {
              upsertDiscoveryChatSession(s);
              setShowKickoffForm(false);
            }}
            onCancel={() => setShowKickoffForm(false)}
          />
        </Modal>
      )}

      {error && <p className="passcode-gate__error">{error}</p>}

      <div className="chat-panel__quick-prompts">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="btn btn--ghost"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-dim)' }}
            onClick={() => composeRef.current?.setText(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <form
        className="chat-panel__composer"
        onSubmit={(e) => {
          e.preventDefault();
          composeRef.current?.submit();
        }}
      >
        <MentionComposeInput
          ref={composeRef}
          onSubmit={handleSend}
          mentionable={mentionable}
          videoSelection={videoSelection}
          placeholder="Ask about this agent's runs, or ask it to edit a row…"
          disabled={sending}
        />
        {sending ? (
          <button type="button" className="btn" onClick={handleStop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn--primary">
            Send
          </button>
        )}
      </form>
    </div>
  );
}
