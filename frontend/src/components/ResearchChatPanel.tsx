import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  acceptResearchResult,
  bulkAcceptResearchResults,
  bulkDiscardResearchResults,
  createChatSession,
  deleteChatSession,
  discardResearchResult,
  listChatSessions,
  listItems,
  listResearchRuns,
  logResearchRun,
  renameChatSession,
  streamResearchRun,
  streamResearchRunUpdates,
} from '../api/projectsApiClient';
import { sendChatMessage } from '../api/projectChatApiClient';
import type { ChatSession, ChatStreamEvent, ProjectItem, ResearchResult, ResearchRun, ResearchRunStatus, Rubric } from '../api/apiClient.types';
import { useProjectWorkspaceStore } from '../store/projectWorkspaceStore';
import { projectItemReference, type ChatReference } from '../utils/chatReferences';
import { formatClock } from '../utils/timeFormat';
import { collectRunRefs, combinedAgentStatus } from '../utils/agentRunStatus';
import type { VideoSelection } from './VideoScrubber';
import { CheckIcon, LightbulbIcon, PencilIcon, SearchIcon, SparkleIcon, TrashIcon } from './icons';
import { ConfirmModal } from './ConfirmModal';
import { EditableTitle } from './EditableTitle';
import { ChatMarkdown } from './ChatMarkdown';
import { Modal } from './Modal';
import { MentionComposeInput, type MentionComposeInputHandle } from './MentionComposeInput';
import { MessageWithReferences } from './MessageWithReferences';

export interface ResearchChatPanelProps {
  projectId: string;
  passcode: string;
  testMode: boolean;
  /** Which item's panel this chat is docked in, if any — passed through to
   * every message so the tool-calling agent knows what to mutate. */
  itemId?: string;
  /** The project's items, for the inline kickoff form's "need research" count
   * and custom-selection picker. Only needed where a kickoff form can appear
   * (every context, in practice) — defaults to empty for callers that never
   * show one. */
  items?: ProjectItem[];
  /** Deep-link from the global Agents tab — opens this specific session's
   * chat instead of the library view, once. */
  initialSessionId?: string;
  /** Deep-link from the global Agents tab's create-flow picker — fires the
   * matching create handler once, instead of landing on the library view. */
  initialAutoCreate?: 'agent' | 'session';
  /** The scrubber's current marked in/out range, if any — offered as a
   * "Current video selection" pick in the @ dropdown and via drag-and-drop
   * from the scrubber itself. */
  videoSelection?: VideoSelection | null;
}

const QUICK_PROMPTS = [
  'What do you think of this line for the target country?',
  'Search the web to check how this reads there.',
  'Propose a replacement line.',
];

function toolStepLabel(name: string, args: Record<string, unknown>): ReactNode {
  if (name === 'search_web') return <><SearchIcon /> Searching the web via Parallel…</>;
  if (name === 'update_rubric_score') return <><PencilIcon /> Updating a rubric score…</>;
  if (name === 'propose_replacement') return <><LightbulbIcon /> Proposing a replacement…</>;
  if (name === 'update_assessment') return <><PencilIcon /> Updating the AI assessment…</>;
  if (name === 'describe_video_segment') return <>Looking at {formatClock(Number(args.startMs))}–{formatClock(Number(args.endMs))}…</>;
  return <>Calling {name}…</>;
}

interface SearchResultCard {
  url?: string;
  title?: string;
}

interface MutationResultDetail {
  summary: string;
  title: string;
  body: ReactNode;
}

/** Turns a mutation tool's raw result object into a human-readable summary
 * line plus a fuller breakdown for the detail modal — replaces dumping
 * `JSON.stringify(result)` straight into the chat, which read as raw and
 * technical. Returns null for a tool/result shape this doesn't know how to
 * format, so the caller can fall back to the JSON dump rather than show
 * nothing. */
function formatMutationResult(name: string, result: Record<string, unknown>, rubrics: Rubric[]): MutationResultDetail | null {
  if (name === 'update_rubric_score') {
    const { rubricId, score, importanceScore } = result as { rubricId?: unknown; score?: unknown; importanceScore?: unknown };
    if (typeof rubricId !== 'string' || typeof score !== 'number') return null;
    const rubricName = rubrics.find((r) => r.id === rubricId)?.name ?? 'this rubric';
    return {
      summary: `Set "${rubricName}" to ${score}/10`,
      title: 'Rubric score updated',
      body: (
        <>
          <div className="field">
            <label>Rubric</label>
            <p>{rubricName}</p>
          </div>
          <div className="field">
            <label>New score</label>
            <p>{score}/10</p>
          </div>
          {typeof importanceScore === 'number' && (
            <div className="field">
              <label>New importance score</label>
              <p>{importanceScore.toFixed(1)}</p>
            </div>
          )}
        </>
      ),
    };
  }
  if (name === 'update_assessment') {
    const { shouldTranscreate, summary } = result as { shouldTranscreate?: unknown; summary?: unknown };
    if (typeof shouldTranscreate !== 'boolean') return null;
    return {
      summary: `Set AI Assessment to "${shouldTranscreate ? 'Needs Change' : 'Fine As-Is'}"`,
      title: 'AI Assessment updated',
      body: (
        <>
          <div className="field">
            <label>AI Assessment</label>
            <p>{shouldTranscreate ? 'Needs Change' : 'Fine As-Is'}</p>
          </div>
          {typeof summary === 'string' && summary && (
            <div className="field">
              <label>Executive reason</label>
              <p>{summary}</p>
            </div>
          )}
        </>
      ),
    };
  }
  if (name === 'propose_replacement') {
    const { suggestedReplacement } = result as { suggestedReplacement?: { text?: string; justification?: string } };
    if (!suggestedReplacement?.text) return null;
    return {
      summary: `Proposed a replacement: "${suggestedReplacement.text.length > 50 ? `${suggestedReplacement.text.slice(0, 50)}…` : suggestedReplacement.text}"`,
      title: 'Replacement proposed',
      body: (
        <>
          <div className="field">
            <label>Replacement text</label>
            <p>{suggestedReplacement.text}</p>
          </div>
          {suggestedReplacement.justification && (
            <div className="field">
              <label>Why</label>
              <p>{suggestedReplacement.justification}</p>
            </div>
          )}
        </>
      ),
    };
  }
  return null;
}

function ToolCallCard({ name, args, result, rubrics }: { name: string; args: Record<string, unknown>; result?: Record<string, unknown>; rubrics: Rubric[] }) {
  const [showDetail, setShowDetail] = useState(false);
  const isSearch = name === 'search_web';
  const isVideoSight = name === 'describe_video_segment';
  const isMutation = !isSearch && !isVideoSight;
  const mutationDetail = isMutation && result && result.error === undefined ? formatMutationResult(name, result, rubrics) : null;

  return (
    <>
    <div
      className={`chat-step-card${isSearch ? ' chat-step-card--search' : ''}${mutationDetail ? ' chat-step-card--clickable' : ''}`}
      onClick={mutationDetail ? () => setShowDetail(true) : undefined}
      role={mutationDetail ? 'button' : undefined}
      tabIndex={mutationDetail ? 0 : undefined}
      onKeyDown={mutationDetail ? (e) => (e.key === 'Enter' || e.key === ' ') && setShowDetail(true) : undefined}
    >
      <p className="chat-step-card__label">
        {result
          ? isSearch
            ? <><SearchIcon /> Searched the web via Parallel</>
            : isVideoSight
              ? <><CheckIcon /> Looked at {formatClock(Number(args.startMs))}–{formatClock(Number(args.endMs))}</>
              : <><CheckIcon /> {name}</>
          : toolStepLabel(name, args)}
      </p>
      {isSearch && Array.isArray(args.search_queries) && (
        <p className="chat-step-card__query">Query: {(args.search_queries as string[]).join(', ')}</p>
      )}
      {!isSearch && !isVideoSight && !result && (
        <p className="chat-step-card__query">{JSON.stringify(args)}</p>
      )}
      {result?.error !== undefined && <p className="passcode-gate__error">{String(result.error)}</p>}
      {isSearch && result && Array.isArray(result.results) && (
        <div className="chat-step-card__results">
          {(result.results as SearchResultCard[]).map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="chat-search-result" onClick={(e) => e.stopPropagation()}>
              <p className="chat-search-result__title">{r.title ?? r.url}</p>
            </a>
          ))}
        </div>
      )}
      {isVideoSight && result && typeof result.description === 'string' && (
        <p className="chat-step-card__query">{result.description}</p>
      )}
      {isMutation && result && result.error === undefined && (
        <p className="chat-step-card__query">{mutationDetail ? mutationDetail.summary : `Applied: ${JSON.stringify(result)}`}</p>
      )}
    </div>

    {showDetail && mutationDetail && (
      <Modal title={mutationDetail.title} onClose={() => setShowDetail(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-default)' }}>{mutationDetail.body}</div>
      </Modal>
    )}
    </>
  );
}

/** Read-only, per-pending-item review card — reuses ProjectItemView's
 * verdict-badge/finding-card/replacement-card markup, without the editable
 * expand/collapse machinery (these are short-lived pre-acceptance previews,
 * not the permanent per-item panel). */
function PendingResultCard({
  result,
  item,
  rubrics,
  selected,
  onToggle,
  onAccept,
  onDiscard,
  busy,
}: {
  result: ResearchResult;
  item: ProjectItem | undefined;
  rubrics: Rubric[];
  selected: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  return (
    <div className="pending-result-card">
      <div className="pending-result-card__header">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Select this result" />
        <p className="content-card__primary">{item?.subtitleText ?? result.itemId}</p>
        <span className={`verdict-badge verdict-badge--${result.shouldTranscreate ? 'change' : 'no-change'}`}>
          {result.shouldTranscreate ? 'Needs Change' : 'Fine As-Is'}
        </span>
      </div>
      <p className="verdict-block__text">{result.summary}</p>

      {result.scores.map((score) => {
        const rubric = rubrics.find((r) => r.id === score.rubricId);
        const tier = score.score >= 7 ? 'high' : score.score >= 4 ? 'mid' : 'low';
        return (
          <div className="finding-card" key={score.rubricId}>
            <div className="finding-card__top">
              <p className="finding-card__rubric">{rubric?.name ?? score.rubricId}</p>
              <span className={`score-circle score-circle--${tier}`}>
                <span className="score-circle__value">{score.score}</span>
                <span className="score-circle__max">/10</span>
              </span>
            </div>
            <p className="finding-card__text">{score.reasoning}</p>
          </div>
        );
      })}

      {result.suggestedReplacement && (
        <div className="replacement-card">
          <p className="replacement-card__label">Suggested replacement</p>
          <p className="replacement-card__text">{result.suggestedReplacement.text}</p>
          <p className="replacement-card__why">{result.suggestedReplacement.justification}</p>
        </div>
      )}

      <div className="pending-result-card__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

function ResearchResultsModal({
  run,
  items,
  rubrics,
  onAcceptOne,
  onDiscardOne,
  onBulkAccept,
  onBulkDiscard,
  onClose,
}: {
  run: ResearchRun;
  items: ProjectItem[];
  rubrics: Rubric[];
  onAcceptOne: (itemId: string) => Promise<void>;
  onDiscardOne: (itemId: string) => Promise<void>;
  onBulkAccept: (itemIds: string[]) => Promise<void>;
  onBulkDiscard: (itemIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDiscard, setConfirmBulkDiscard] = useState(false);

  // Drop any selected itemId once its pending result is gone (accepted/discarded).
  useEffect(() => {
    setSelected((prev) => {
      const stillPresent = new Set(run.pendingResults.map((r) => r.itemId));
      const next = new Set([...prev].filter((id) => stillPresent.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [run.pendingResults]);

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === run.pendingResults.length ? new Set() : new Set(run.pendingResults.map((r) => r.itemId))));
  }

  async function handleAccept(itemId: string) {
    setBusyItemId(itemId);
    try {
      await onAcceptOne(itemId);
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleDiscard(itemId: string) {
    setBusyItemId(itemId);
    try {
      await onDiscardOne(itemId);
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleBulkAccept() {
    setBulkBusy(true);
    try {
      await onBulkAccept([...selected]);
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
      title={`${run.pendingResults.length} result${run.pendingResults.length === 1 ? '' : 's'} pending review`}
      onClose={onClose}
      className="research-results-modal"
    >
      {run.pendingResults.length === 0 ? (
        <p className="results-placeholder">All results reviewed.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={selected.size === run.pendingResults.length} onChange={toggleAll} /> Select all
            </label>
            <button type="button" className="btn btn--primary" disabled={selected.size === 0 || bulkBusy} onClick={handleBulkAccept}>
              Accept {selected.size || ''} selected
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

          <div className="pending-result-list">
            {run.pendingResults.map((result) => (
              <PendingResultCard
                key={result.itemId}
                result={result}
                item={items.find((i) => i.id === result.itemId)}
                rubrics={rubrics}
                selected={selected.has(result.itemId)}
                onToggle={() => toggle(result.itemId)}
                onAccept={() => handleAccept(result.itemId)}
                onDiscard={() => handleDiscard(result.itemId)}
                busy={busyItemId === result.itemId}
              />
            ))}
          </div>
        </>
      )}

      {confirmBulkDiscard && (
        <ConfirmModal
          title="Discard these results?"
          body={`${selected.size} pending result${selected.size === 1 ? '' : 's'} will be dropped without being applied. This can't be undone.`}
          confirmLabel="Discard"
          busy={bulkBusy}
          onConfirm={handleBulkDiscardConfirmed}
          onCancel={() => setConfirmBulkDiscard(false)}
        />
      )}
    </Modal>
  );
}

/** One bulk ResearchRun, inline in the thread — subscribes to the resumable
 * per-run stream independent of whichever request originally kicked it off
 * (see docs/adr/0025 and routes/projects.ts's .../research-runs/:runId/stream),
 * the same way DiscoveryRunCard doesn't depend on its original kickoff call
 * staying open. Results are staged as pendingResults, same as Discovery's
 * candidate rows — a human must accept or discard each one before it lands. */
function ResearchRunCard({
  run,
  items,
  rubrics,
  onAcceptOne,
  onDiscardOne,
  onBulkAccept,
  onBulkDiscard,
}: {
  run: ResearchRun | undefined;
  items: ProjectItem[];
  rubrics: Rubric[];
  onAcceptOne: (runId: string, itemId: string) => Promise<void>;
  onDiscardOne: (runId: string, itemId: string) => Promise<void>;
  onBulkAccept: (runId: string, itemIds: string[]) => Promise<void>;
  onBulkDiscard: (runId: string, itemIds: string[]) => Promise<void>;
}) {
  const [showResults, setShowResults] = useState(false);

  if (!run) return <div className="agent-run-card results-placeholder">Loading run…</div>;

  const isRunning = run.status === 'queued' || run.status === 'running';

  return (
    <div className="agent-run-card">
      <div className="agent-run-card__header">
        <p className="content-card__primary">
          {run.mode === 'need-research' ? 'Research run' : 'Custom research run'} — {run.status}
        </p>
        <p className="content-card__secondary">
          {run.itemIds.length} item{run.itemIds.length === 1 ? '' : 's'} targeted{run.testMode ? ' · test mode' : ''}
        </p>
      </div>

      {isRunning && (
        <p className="results-status" role="status">
          {run.completedBatches}/{run.totalBatches || '?'} batches complete…
        </p>
      )}
      {run.status === 'error' && <p className="passcode-gate__error">{run.errorMessage}</p>}

      {run.status === 'done' && (
        <>
          {run.pendingResults.length === 0 ? (
            <p className="results-placeholder">Finished — all results reviewed.</p>
          ) : (
            <button type="button" className="run-result-badge" onClick={() => setShowResults(true)}>
              <SparkleIcon width={14} height={14} /> {run.pendingResults.length} result{run.pendingResults.length === 1 ? '' : 's'} pending review
            </button>
          )}
        </>
      )}

      {showResults && (
        <ResearchResultsModal
          run={run}
          items={items}
          rubrics={rubrics}
          onAcceptOne={(itemId) => onAcceptOne(run.id, itemId)}
          onDiscardOne={(itemId) => onDiscardOne(run.id, itemId)}
          onBulkAccept={(itemIds) => onBulkAccept(run.id, itemIds)}
          onBulkDiscard={(itemIds) => onBulkDiscard(run.id, itemIds)}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}

/** The inline kickoff form — same fields ResearchKickoffPanel used to show in
 * a modal. Shown automatically for a brand-new project-level session, or on
 * demand via "Kick off a research run" otherwise. Kicks off the run via the
 * existing streamResearchRun (which performs the actual batch loop inline in
 * that request) but only rides that connection long enough to learn the new
 * run's id off its first event — the ResearchRunCard takes over from there via
 * the independent resumable stream, so the kickoff form can close immediately
 * instead of blocking on the whole batch. */
function KickoffForm({
  projectId,
  passcode,
  testMode,
  sessionId,
  items,
  onCreated,
  onCancel,
}: {
  projectId: string;
  passcode: string;
  testMode: boolean;
  sessionId: string;
  items: ProjectItem[];
  onCreated: (session: ChatSession) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<'need-research' | 'custom'>('need-research');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useTestMode, setUseTestMode] = useState(testMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needResearchCount = items.filter((i) => i.action === 'need-research').length;
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'custom' && selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    let logged = false;

    streamResearchRun(
      projectId,
      { passcode, testMode: useTestMode, mode, itemIds: mode === 'custom' ? [...selected] : undefined },
      (event) => {
        if (logged) return;
        if (event.type === 'progress') {
          logged = true;
          logResearchRun(projectId, sessionId, { passcode, runId: event.runId })
            .then(onCreated)
            .catch((err) => setError(err instanceof Error ? err.message : 'failed to log the run into this session'))
            .finally(() => setSubmitting(false));
        } else if (event.type === 'error') {
          logged = true;
          setError(event.message);
          setSubmitting(false);
        }
      },
    ).catch((err) => {
      if (!logged) {
        setError(err instanceof Error ? err.message : 'failed to kick off research run');
        setSubmitting(false);
      }
    });
  }

  return (
    <form className="agent-kickoff-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>Which items?</label>
        <div className="column-checklist">
          <label className="checkbox-field">
            <input
              type="radio"
              name="research-kickoff-mode"
              checked={mode === 'need-research'}
              onChange={() => setMode('need-research')}
              disabled={submitting}
            />
            Marked &ldquo;Need research&rdquo; ({needResearchCount})
          </label>
          <label className="checkbox-field">
            <input type="radio" name="research-kickoff-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} disabled={submitting} />
            Custom selection
          </label>
        </div>
      </div>

      {mode === 'custom' && (
        <div className="details-table-wrap details-table-wrap--standalone">
          <div className="details-table-scroll">
            <table className="details-table">
              <thead>
                <tr>
                  <th className="details-table__checkbox-col">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={submitting} aria-label={allSelected ? 'Deselect all items' : 'Select all items'} />
                  </th>
                  <th>Time</th>
                  <th>Subtitle</th>
                  <th>Scene / segment description</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="details-table__checkbox-col">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        disabled={submitting}
                        aria-label={`Select item at ${formatClock(item.startMs)}`}
                      />
                    </td>
                    <td className="details-table__cell--nowrap-exempt">
                      {formatClock(item.startMs)}–{formatClock(item.endMs)}
                    </td>
                    <td>{item.subtitleText || <em>Visual only</em>}</td>
                    <td>{item.sceneDescription}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <label className="checkbox-field">
        <input type="checkbox" checked={useTestMode} onChange={(e) => setUseTestMode(e.target.checked)} disabled={submitting} />
        Test mode (mock research agent, no real Gemini/Parallel calls)
      </label>

      {error && <p className="passcode-gate__error">{error}</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={submitting || (mode === 'need-research' ? needResearchCount === 0 : selected.size === 0)}
        >
          {submitting ? 'Kicking off…' : 'Kick off research'}
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

export function ResearchChatPanel({
  projectId,
  passcode,
  testMode,
  itemId,
  items = [],
  initialSessionId,
  initialAutoCreate,
  videoSelection,
}: ResearchChatPanelProps) {
  const {
    chatSessions,
    activeChatSessionId,
    setChatSessions,
    addChatSession,
    upsertChatSession,
    removeChatSession,
    setActiveChatSessionId,
    applyChatEvent,
    setItems,
    patchItem,
    rubrics,
  } = useProjectWorkspaceStore();
  const [panelView, setPanelView] = useState<'library' | 'chat'>('library');
  const composeRef = useRef<MentionComposeInputHandle>(null);
  const [sending, setSending] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ChatStreamEvent[]>([]);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKickoffForm, setShowKickoffForm] = useState(false);
  const [runDetails, setRunDetails] = useState<Record<string, ResearchRun>>({});
  const [runStatuses, setRunStatuses] = useState<Record<string, ResearchRunStatus>>({});
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [deleting, setDeleting] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    listChatSessions(projectId, passcode).then((sessions) => {
      if (cancelled) return;
      setChatSessions(sessions);
    });
    // The project's run status list, joined against each session's own `run`
    // marker turns below — same "session status alone doesn't mean the batch
    // Run finished" gap FilmAgentsTab.tsx fixes, applied to this switcher list.
    listResearchRuns(projectId, passcode).then((runs) => {
      if (cancelled) return;
      setRunStatuses(Object.fromEntries(runs.map((r) => [r.id, r.status])));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, passcode]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [liveEvents, activeChatSessionId]);

  // Deep-link from the global Agents tab — open a specific session or fire a
  // create-flow once, instead of landing on the library view.
  useEffect(() => {
    if (initialSessionId) {
      setActiveChatSessionId(initialSessionId);
      setPanelView('chat');
    } else if (initialAutoCreate === 'agent') {
      handleCreateAgent();
    } else if (initialAutoCreate === 'session') {
      handleCreateSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId, initialAutoCreate]);

  const activeSession = chatSessions.find((s) => s.id === activeChatSessionId) ?? null;
  const mentionable = useMemo<ChatReference[]>(() => items.map(projectItemReference), [items]);

  // Populate runDetails for every `run` part in the active session's turns —
  // one-shot per run (streamResearchRunUpdates replays the current snapshot
  // then closes for an already-terminal run, or keeps following if still
  // running), same pattern as DiscoveryChatPanel's jobDetails cache.
  useEffect(() => {
    if (!activeSession) return;
    const runIds = activeSession.turns.flatMap((t) => t.parts.filter((p) => p.run).map((p) => p.run!.runId));
    const missing = [...new Set(runIds)].filter((runId) => !(runId in runDetails));
    if (missing.length === 0) return;
    let cancelled = false;
    for (const runId of missing) {
      streamResearchRunUpdates(projectId, runId, passcode, (event) => {
        if (cancelled) return;
        setRunDetails((prev) => ({ ...prev, [runId]: event.run }));
        // Batch results land on the ProjectItem docs directly as the run
        // progresses (see routes/projects.ts) — this connection only sees the
        // run doc itself (completedBatches ticking up), so re-fetch every time
        // it changes to keep the table behind the panel scoring live, same
        // as before this kickoff form stopped driving the original SSE
        // connection past its first event.
        listItems(projectId, passcode).then((items) => {
          if (!cancelled) setItems(items);
        });
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, activeSession?.turns.length]);

  function removeResultsFromRun(runId: string, itemIds: string[]) {
    const idSet = new Set(itemIds);
    setRunDetails((prev) =>
      prev[runId]
        ? { ...prev, [runId]: { ...prev[runId], pendingResults: prev[runId].pendingResults.filter((r) => !idSet.has(r.itemId)) } }
        : prev,
    );
  }

  function removeResultFromRun(runId: string, itemId: string) {
    removeResultsFromRun(runId, [itemId]);
  }

  async function handleAcceptResult(runId: string, itemId: string) {
    const updated = await acceptResearchResult(projectId, runId, itemId, passcode);
    patchItem(updated.id, updated);
    removeResultFromRun(runId, itemId);
  }

  async function handleDiscardResult(runId: string, itemId: string) {
    await discardResearchResult(projectId, runId, itemId, passcode);
    removeResultFromRun(runId, itemId);
  }

  async function handleBulkAcceptResults(runId: string, itemIds: string[]) {
    const updated = await bulkAcceptResearchResults(projectId, runId, itemIds, passcode);
    for (const item of updated) patchItem(item.id, item);
    removeResultsFromRun(runId, itemIds);
  }

  async function handleBulkDiscardResults(runId: string, itemIds: string[]) {
    await bulkDiscardResearchResults(projectId, runId, itemIds, passcode);
    removeResultsFromRun(runId, itemIds);
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteChatSession(projectId, deleteTarget.id, passcode);
      removeChatSession(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete session');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateAgent() {
    const nextSessionNumber = Math.max(0, ...chatSessions.map((s) => s.sessionNumber)) + 1;
    const session = await createChatSession(projectId, { passcode, name: `Agent #${nextSessionNumber}` });
    addChatSession(session);
    setPanelView('chat');
    setShowKickoffForm(true);
  }

  async function handleCreateSession() {
    const session = await createChatSession(projectId, { passcode, name: 'Session' });
    addChatSession(session);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  async function handleRenameSession(name: string) {
    if (!activeSession) return;
    const session = await renameChatSession(projectId, activeSession.id, { passcode, name });
    upsertChatSession(session);
  }

  function openSession(id: string) {
    setActiveChatSessionId(id);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  async function handleSend(text: string) {
    let session = activeSession;
    if (!session) {
      session = await createChatSession(projectId, { passcode });
      addChatSession(session);
    }

    setSending(true);
    setError(null);
    setLiveEvents([]);
    setPendingUserText(text);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      await sendChatMessage(
        projectId,
        session.id,
        { passcode, text, testMode, itemId },
        (event) => {
          setLiveEvents((prev) => [...prev, event]);
          applyChatEvent(event);
          if (event.type === 'error') setError(event.message);
        },
        { signal: controller.signal },
      );
    } finally {
      // Re-fetch the session so the persisted turns (source of truth) replace
      // the live-event overlay — the backend already wrote them incrementally.
      const sessions = await listChatSessions(projectId, passcode);
      setChatSessions(sessions);
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
          {chatSessions.length === 0 && (
            <p className="results-placeholder">No sessions yet — start one to talk with the research agent.</p>
          )}
          {[...chatSessions].reverse().map((s) => {
            const lastText = [...s.turns].reverse().find((t) => t.parts.some((p) => p.text))?.parts.find((p) => p.text)?.text;
            const { runIds } = collectRunRefs(s.turns);
            // Prefer runDetails (live via this panel's own
            // streamResearchRunUpdates subscription, populated the moment a
            // run is kicked off — see the effect below) over the once-fetched
            // runStatuses snapshot, so a run kicked off this session updates
            // the badge without a reload.
            const linkedRunStatuses = runIds
              .map((id) => runDetails[id]?.status ?? runStatuses[id])
              .filter((v): v is ResearchRunStatus => v !== undefined);
            const combined = combinedAgentStatus(s.status, linkedRunStatuses);
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
                  aria-label="Delete session"
                  title="Delete session"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(s);
                  }}
                >
                  <TrashIcon />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-badge status-badge--${combined}`}>{combined}</span>
                  <span className="chat-panel__library-item-name">{s.name ?? `Session ${s.sessionNumber}`}</span>
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
            title="Delete this session?"
            body={`"${deleteTarget.name ?? `Session ${deleteTarget.sessionNumber}`}" and its whole conversation will be permanently removed. This can't be undone.`}
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
          value={activeSession.name ?? `Session ${activeSession.sessionNumber}`}
          onSave={handleRenameSession}
        />
      )}

      <div className="chat-panel__thread" ref={threadRef}>
        {!activeSession && chatSessions.length === 0 && (
          <p className="results-placeholder">Send a message to start a chat session for this project.</p>
        )}
        {activeSession?.turns.map((turn, i) => {
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
                <ResearchRunCard
                  key={`${i}-${gi}`}
                  run={runDetails[g.run.runId]}
                  items={items}
                  rubrics={rubrics}
                  onAcceptOne={handleAcceptResult}
                  onDiscardOne={handleDiscardResult}
                  onBulkAccept={handleBulkAcceptResults}
                  onBulkDiscard={handleBulkDiscardResults}
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
              return <ToolCallCard key={`${i}-${gi}`} name={g.functionCall.name} args={g.functionCall.args} result={response} rubrics={rubrics} />;
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
              <ToolCallCard
                key={i}
                name={event.name}
                args={event.args}
                result={result && result.type === 'tool_result' ? result.result : undefined}
                rubrics={rubrics}
              />
            );
          }
          return null;
        })}
        {sending && <p className="results-status" role="status">Thinking…</p>}

        {activeSession && !sending && !itemId && activeSession.turns.length === 0 && (
          <p className="results-placeholder">
            No runs yet. Kick off a research run to get started, or just send a message below.
          </p>
        )}

        {activeSession && !sending && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowKickoffForm(true)}>
            <SparkleIcon /> {activeSession.turns.length === 0 ? 'Kick off a research run' : 'Kick off another research run'}
          </button>
        )}
      </div>

      {showKickoffForm && activeSession && (
        <Modal title="Kick off agentic research?" onClose={() => setShowKickoffForm(false)} className="kickoff-modal">
          <KickoffForm
            projectId={projectId}
            passcode={passcode}
            testMode={testMode}
            sessionId={activeSession.id}
            items={items}
            onCreated={(s) => {
              upsertChatSession(s);
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
          placeholder={itemId ? 'Ask about this line…' : 'Open a detail row to discuss a specific item…'}
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
