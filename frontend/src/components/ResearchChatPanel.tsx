import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createChatSession, listChatSessions, listItems, logResearchRun, streamResearchRun, streamResearchRunUpdates } from '../api/projectsApiClient';
import { sendChatMessage } from '../api/projectChatApiClient';
import type { ChatSession, ChatStreamEvent, ProjectItem, ResearchRun } from '../api/apiClient.types';
import { useProjectWorkspaceStore } from '../store/projectWorkspaceStore';
import { CheckIcon, LightbulbIcon, PencilIcon, SearchIcon, SparkleIcon } from './icons';

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
}

const QUICK_PROMPTS = [
  'What do you think of this line for the target country?',
  'Search the web to check how this reads there.',
  'Propose a replacement line.',
];

function toolStepLabel(name: string): ReactNode {
  if (name === 'search_web') return <><SearchIcon /> Searching the web via Parallel…</>;
  if (name === 'update_rubric_score') return <><PencilIcon /> Updating a rubric score…</>;
  if (name === 'propose_replacement') return <><LightbulbIcon /> Proposing a replacement…</>;
  return <>Calling {name}…</>;
}

interface SearchResultCard {
  url?: string;
  title?: string;
  excerpts?: string[];
}

function ToolCallCard({ name, args, result }: { name: string; args: Record<string, unknown>; result?: Record<string, unknown> }) {
  const isSearch = name === 'search_web';
  return (
    <div className={`chat-step-card${isSearch ? ' chat-step-card--search' : ''}`}>
      <p className="chat-step-card__label">
        {result ? isSearch ? <><SearchIcon /> Searched the web via Parallel</> : <><CheckIcon /> {name}</> : toolStepLabel(name)}
      </p>
      {isSearch && Array.isArray(args.search_queries) && (
        <p className="chat-step-card__query">Query: {(args.search_queries as string[]).join(', ')}</p>
      )}
      {!isSearch && !result && (
        <p className="chat-step-card__query">{JSON.stringify(args)}</p>
      )}
      {result?.error !== undefined && <p className="passcode-gate__error">{String(result.error)}</p>}
      {isSearch && result && Array.isArray(result.results) && (
        <div className="chat-step-card__results">
          {(result.results as SearchResultCard[]).map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="chat-search-result">
              <p className="chat-search-result__title">{r.title ?? r.url}</p>
              {r.excerpts?.[0] && <p className="chat-search-result__excerpt">{r.excerpts[0]}</p>}
            </a>
          ))}
        </div>
      )}
      {!isSearch && result && result.error === undefined && (
        <p className="chat-step-card__query">Applied: {JSON.stringify(result)}</p>
      )}
    </div>
  );
}

/** One bulk ResearchRun, inline in the thread — subscribes to the resumable
 * per-run stream independent of whichever request originally kicked it off
 * (see docs/adr/0025 and routes/projects.ts's .../research-runs/:runId/stream),
 * the same way DiscoveryRunCard doesn't depend on its original kickoff call
 * staying open. Results are already applied to the items by the time they're
 * visible here — no accept/discard step, unlike Discovery's candidate rows. */
function ResearchRunCard({ run }: { run: ResearchRun | undefined }) {
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
        <p className="content-card__secondary">
          Finished — {run.completedBatches}/{run.totalBatches} batches, results applied to the items directly.
        </p>
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

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
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
      <p className="agent-kickoff-form__title">Kick off agentic research?</p>

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
        <div className="details-table-wrap details-table-wrap--standalone" style={{ maxHeight: 200 }}>
          <div className="details-table-scroll">
            <table className="details-table">
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} disabled={submitting} />
                    </td>
                    <td>{item.subtitleText || <em>Visual only</em>}</td>
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

export function ResearchChatPanel({ projectId, passcode, testMode, itemId, items = [] }: ResearchChatPanelProps) {
  const { chatSessions, activeChatSessionId, setChatSessions, addChatSession, upsertChatSession, setActiveChatSessionId, applyChatEvent, setItems } =
    useProjectWorkspaceStore();
  const [panelView, setPanelView] = useState<'library' | 'chat'>('library');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ChatStreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showKickoffForm, setShowKickoffForm] = useState(false);
  const [runDetails, setRunDetails] = useState<Record<string, ResearchRun>>({});
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    listChatSessions(projectId, passcode).then((sessions) => {
      if (cancelled) return;
      setChatSessions(sessions);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, passcode]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [liveEvents, activeChatSessionId]);

  const activeSession = chatSessions.find((s) => s.id === activeChatSessionId) ?? null;

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

  async function handleNewSession() {
    const session = await createChatSession(projectId, { passcode });
    addChatSession(session);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  function openSession(id: string) {
    setActiveChatSessionId(id);
    setPanelView('chat');
    setShowKickoffForm(false);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;

    let session = activeSession;
    if (!session) {
      session = await createChatSession(projectId, { passcode });
      addChatSession(session);
    }

    setDraft('');
    setSending(true);
    setError(null);
    setLiveEvents([]);
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
      );
    } finally {
      // Re-fetch the session so the persisted turns (source of truth) replace
      // the live-event overlay — the backend already wrote them incrementally.
      const sessions = await listChatSessions(projectId, passcode);
      setChatSessions(sessions);
      setLiveEvents([]);
      setSending(false);
    }
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
            return (
              <button
                key={s.id}
                type="button"
                className="chat-panel__library-item"
                onClick={() => openSession(s.id)}
              >
                <span className="chat-panel__library-item-name">{s.name ?? `Session ${s.sessionNumber}`}</span>
                {lastText && <span className="chat-panel__library-item-preview">{lastText}</span>}
                <span className="chat-panel__library-item-meta">{new Date(s.updatedAt).toLocaleString()}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn--primary" onClick={handleNewSession}>
          + New session
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
        {!activeSession && chatSessions.length === 0 && (
          <p className="results-placeholder">Send a message to start a chat session for this project.</p>
        )}
        {activeSession?.turns.map((turn, i) => {
          if (turn.role === 'user' && turn.parts[0]?.functionResponse) return null;
          return turn.parts.map((part, pi) => {
            if (part.run) {
              return <ResearchRunCard key={`${i}-${pi}`} run={runDetails[part.run.runId]} />;
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
              return <ToolCallCard key={`${i}-${pi}`} name={part.functionCall.name} args={part.functionCall.args} result={response} />;
            }
            return null;
          });
        })}
        {liveEvents.map((event, i) => {
          if (event.type === 'text_delta') return <div key={i} className="chat-bubble chat-bubble--model">{event.text}</div>;
          if (event.type === 'tool_call') {
            const result = liveEvents.find((e) => e.type === 'tool_result' && e.callId === event.callId);
            return (
              <ToolCallCard
                key={i}
                name={event.name}
                args={event.args}
                result={result && result.type === 'tool_result' ? result.result : undefined}
              />
            );
          }
          return null;
        })}
        {sending && <p className="results-status" role="status">Thinking…</p>}

        {activeSession && !sending && (
          <>
            {!itemId && activeSession.turns.length === 0 ? (
              <KickoffForm
                projectId={projectId}
                passcode={passcode}
                testMode={testMode}
                sessionId={activeSession.id}
                items={items}
                onCreated={(s) => upsertChatSession(s)}
              />
            ) : showKickoffForm ? (
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
            ) : (
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowKickoffForm(true)}>
                <SparkleIcon /> Kick off a research run
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
          placeholder={itemId ? 'Ask about this line…' : 'Open a detail row to discuss a specific item…'}
          disabled={sending}
        />
        <button type="submit" className="btn btn--primary" disabled={sending || draft.trim() === ''}>
          Send
        </button>
      </form>
    </div>
  );
}
