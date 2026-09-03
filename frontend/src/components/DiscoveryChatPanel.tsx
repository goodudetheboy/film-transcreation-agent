import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createDiscoveryAgentSession, listDiscoveryAgentSessions, logDiscoveryRun, sendDiscoveryChatMessage } from '../api/discoveryChatApiClient';
import { createDiscoveryJob, discardDiscoveryResult, mergeDiscoveryResult, streamDiscoveryJob } from '../api/filmsApiClient';
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
import { CheckIcon, SparkleIcon } from './icons';

export interface DiscoveryChatPanelProps {
  filmId: string;
  passcode: string;
  testMode: boolean;
  columns: ColumnDoc[];
}

const QUICK_PROMPTS = [
  'What did this run find?',
  'Fix any typos you see in the segment descriptions.',
  'Which candidate is the most interesting?',
];

const DEFAULT_COLUMNS = ['segmentDescription', 'gesture'];

function columnLabel(key: string, columns: ColumnDoc[]): string {
  if (key in BUILTIN_COLUMN_LABELS) return BUILTIN_COLUMN_LABELS[key as keyof typeof BUILTIN_COLUMN_LABELS];
  return columns.find((c) => c.key === key)?.name ?? key;
}

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
    <form className="discovery-kickoff-form" onSubmit={handleSubmit}>
      <p className="discovery-kickoff-form__title">Kick off Discover agent to find new lines?</p>

      <div className="field">
        <label htmlFor="discovery-run-name">Label (optional)</label>
        <input id="discovery-run-name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
      </div>

      <div className="field">
        <label htmlFor="discovery-run-instruction">Special instruction</label>
        <input
          id="discovery-run-instruction"
          type="text"
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

/** One run (DiscoveryJob pass), inline in the thread — the same content
 * AgentStatusPanel used to show as its own panel, restyled as a card. */
function DiscoveryRunCard({
  job,
  columns,
  onMerge,
  onDiscard,
}: {
  job: DiscoveryJob | undefined;
  columns: ColumnDoc[];
  onMerge: (jobId: string, tempId: string) => Promise<void>;
  onDiscard: (jobId: string, tempId: string) => Promise<void>;
}) {
  const [busyTempId, setBusyTempId] = useState<string | null>(null);

  if (!job) return <div className="discovery-run-card results-placeholder">Loading run…</div>;

  const currentJob = job;
  const isRunning = currentJob.status === 'queued' || currentJob.status === 'running';

  async function handleMerge(tempId: string) {
    setBusyTempId(tempId);
    try {
      await onMerge(currentJob.id, tempId);
    } finally {
      setBusyTempId(null);
    }
  }

  async function handleDiscard(tempId: string) {
    setBusyTempId(tempId);
    try {
      await onDiscard(currentJob.id, tempId);
    } finally {
      setBusyTempId(null);
    }
  }

  return (
    <div className="discovery-run-card">
      <div className="discovery-run-card__header">
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
            <ul className="content-list">
              {job.resultRows.map((r) => (
                <li key={r.tempId} className="content-card">
                  <p className="content-card__caption">
                    {formatClock(r.startMs)} – {formatClock(r.endMs)}
                  </p>
                  <p className="content-card__primary">&ldquo;{r.subtitleText}&rdquo;</p>
                  <p className="content-card__secondary">
                    {Object.entries(r.values)
                      .filter(([k]) => k !== 'custom')
                      .map(([k, v]) => `${columnLabel(k, columns)}: ${v}`)
                      .join(' · ')}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button type="button" className="btn btn--primary" disabled={busyTempId === r.tempId} onClick={() => handleMerge(r.tempId)}>
                      Add
                    </button>
                    <button type="button" className="btn btn--ghost" disabled={busyTempId === r.tempId} onClick={() => handleDiscard(r.tempId)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** A tool call the agent made (edit/merge/discard) — same idea as
 * ResearchChatPanel's ToolCallCard. */
function DiscoveryToolCallCard({ name, result }: { name: string; args: Record<string, unknown>; result?: Record<string, unknown> }) {
  const label =
    name === 'edit_detail_row'
      ? 'Edited a Detail row'
      : name === 'merge_candidate_row'
        ? 'Added a candidate to the Details table'
        : name === 'discard_candidate_row'
          ? 'Discarded a candidate'
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

export function DiscoveryChatPanel({ filmId, passcode, testMode, columns }: DiscoveryChatPanelProps) {
  const {
    discoveryChatSessions,
    activeDiscoveryChatSessionId,
    setDiscoveryChatSessions,
    upsertDiscoveryChatSession,
    setActiveDiscoveryChatSessionId,
    applyDiscoveryChatEvent,
    addRow,
  } = useFilmWorkspaceStore();
  const [panelView, setPanelView] = useState<'library' | 'chat'>('library');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [liveEvents, setLiveEvents] = useState<DiscoveryChatStreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showKickoffForm, setShowKickoffForm] = useState(false);
  const [jobDetails, setJobDetails] = useState<Record<string, DiscoveryJob>>({});
  const threadRef = useRef<HTMLDivElement>(null);

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

  const activeSession = discoveryChatSessions.find((s) => s.id === activeDiscoveryChatSessionId) ?? null;

  // Populate jobDetails for every `run` part in the active session's turns —
  // one-shot per job (streamDiscoveryJob replays the current snapshot then
  // closes for an already-terminal job, or keeps following if still running).
  useEffect(() => {
    if (!activeSession) return;
    const jobIds = activeSession.turns.flatMap((t) => t.parts.filter((p) => p.run).map((p) => p.run!.jobId));
    const missing = [...new Set(jobIds)].filter((jobId) => !(jobId in jobDetails));
    if (missing.length === 0) return;
    let cancelled = false;
    for (const jobId of missing) {
      streamDiscoveryJob(filmId, jobId, passcode, (event) => {
        if (!cancelled) setJobDetails((prev) => ({ ...prev, [jobId]: event.job }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, activeSession?.turns.length]);

  function removeCandidateFromJob(jobId: string, tempId: string) {
    setJobDetails((prev) =>
      prev[jobId] ? { ...prev, [jobId]: { ...prev[jobId], resultRows: prev[jobId].resultRows.filter((r) => r.tempId !== tempId) } } : prev,
    );
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

  async function handleNewAgent() {
    const session = await createDiscoveryAgentSession(filmId, { passcode });
    upsertDiscoveryChatSession(session);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  function openSession(id: string) {
    setActiveDiscoveryChatSessionId(id);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    let session = activeSession;
    if (!session) {
      session = await createDiscoveryAgentSession(filmId, { passcode });
      upsertDiscoveryChatSession(session);
    }

    setDraft('');
    setSending(true);
    setError(null);
    setLiveEvents([]);
    try {
      await sendDiscoveryChatMessage(filmId, session.id, { passcode, text, testMode }, (event) => {
        setLiveEvents((prev) => [...prev, event]);
        applyDiscoveryChatEvent(event);
        if (event.type === 'row_added' || event.type === 'row_discarded') removeCandidateFromJob(event.jobId, event.tempId);
        if (event.type === 'error') setError(event.message);
      });
    } finally {
      const sessions = await listDiscoveryAgentSessions(filmId, passcode);
      setDiscoveryChatSessions(sessions);
      setLiveEvents([]);
      setSending(false);
    }
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
              <button key={s.id} type="button" className="chat-panel__library-item" onClick={() => openSession(s.id)}>
                <span className="chat-panel__library-item-name">{s.name ?? `Agent #${s.agentNumber}`}</span>
                {lastText && <span className="chat-panel__library-item-preview">{lastText}</span>}
                <span className="chat-panel__library-item-meta">{new Date(s.updatedAt).toLocaleString()}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn--primary" onClick={handleNewAgent}>
          <SparkleIcon /> New agent
        </button>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <button type="button" className="link-back" onClick={() => setPanelView('library')}>
        ← Library
      </button>

      <div className="chat-panel__thread" ref={threadRef}>
        {activeSession?.turns.map((turn: DiscoveryChatTurn, i) => {
          if (turn.role === 'user' && turn.parts[0]?.functionResponse) return null;
          return turn.parts.map((part, pi) => {
            if (part.run) {
              return (
                <DiscoveryRunCard
                  key={`${i}-${pi}`}
                  job={jobDetails[part.run.jobId]}
                  columns={columns}
                  onMerge={handleMergeCandidate}
                  onDiscard={handleDiscardCandidate}
                />
              );
            }
            if (part.text) {
              return (
                <div key={`${i}-${pi}`} className={`chat-bubble chat-bubble--${turn.role === 'system' ? 'model' : turn.role}`}>
                  {part.text}
                </div>
              );
            }
            if (part.functionCall) {
              const nextTurn = activeSession.turns[i + 1];
              const response = nextTurn?.parts.find((p) => p.functionResponse?.name === part.functionCall!.name)?.functionResponse?.response;
              return <DiscoveryToolCallCard key={`${i}-${pi}`} name={part.functionCall.name} args={part.functionCall.args} result={response} />;
            }
            return null;
          });
        })}

        {liveEvents.map((event, i) => {
          if (event.type === 'text_delta') return <div key={i} className="chat-bubble chat-bubble--model">{event.text}</div>;
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

        {activeSession && !sending && (
          <>
            {activeSession.turns.length === 0 ? (
              <KickoffForm
                filmId={filmId}
                passcode={passcode}
                testMode={testMode}
                agentNumber={activeSession.agentNumber}
                columns={columns}
                onCreated={(s) => upsertDiscoveryChatSession(s)}
              />
            ) : showKickoffForm ? (
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
            ) : (
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowKickoffForm(true)}>
                <SparkleIcon /> Kick off another pass
              </button>
            )}
          </>
        )}
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}

      <div className="chat-panel__quick-prompts">
        {QUICK_PROMPTS.map((p) => (
          <button key={p} type="button" className="btn btn--ghost" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-dim)' }} onClick={() => setDraft(p)}>
            {p}
          </button>
        ))}
      </div>

      <form className="chat-panel__composer" onSubmit={handleSend}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about this agent's runs, or ask it to edit a row…"
          disabled={sending}
        />
        <button type="submit" className="btn btn--primary" disabled={sending || draft.trim() === ''}>
          Send
        </button>
      </form>
    </div>
  );
}
