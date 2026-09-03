import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createChatSession, listChatSessions } from '../api/projectsApiClient';
import { sendChatMessage } from '../api/projectChatApiClient';
import type { ChatStreamEvent, ChatTurn } from '../api/apiClient.types';
import { useProjectWorkspaceStore } from '../store/projectWorkspaceStore';
import { CheckIcon, LightbulbIcon, PencilIcon, SearchIcon } from './icons';

export interface ResearchChatPanelProps {
  projectId: string;
  passcode: string;
  testMode: boolean;
  /** Which item's panel this chat is docked in, if any — passed through to
   * every message so the tool-calling agent knows what to mutate. */
  itemId?: string;
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

/** Renders one persisted ChatTurn's parts (text bubbles + tool step cards). */
function TurnParts({ turn, nextTurn }: { turn: ChatTurn; nextTurn?: ChatTurn }) {
  return (
    <>
      {turn.parts.map((part, i) => {
        if (part.text) {
          return (
            <div key={i} className={`chat-bubble chat-bubble--${turn.role}`}>
              {part.text}
            </div>
          );
        }
        if (part.functionCall) {
          const response = nextTurn?.parts.find((p) => p.functionResponse?.name === part.functionCall!.name)?.functionResponse?.response;
          return <ToolCallCard key={i} name={part.functionCall.name} args={part.functionCall.args} result={response} />;
        }
        return null;
      })}
    </>
  );
}

export function ResearchChatPanel({ projectId, passcode, testMode, itemId }: ResearchChatPanelProps) {
  const { chatSessions, activeChatSessionId, setChatSessions, addChatSession, setActiveChatSessionId, applyChatEvent } =
    useProjectWorkspaceStore();
  const [panelView, setPanelView] = useState<'library' | 'chat'>('library');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ChatStreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  async function handleNewSession() {
    const session = await createChatSession(projectId, { passcode });
    addChatSession(session);
    setPanelView('chat');
  }

  function openSession(id: string) {
    setActiveChatSessionId(id);
    setPanelView('chat');
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
        {activeSession?.turns.map((turn, i) =>
          turn.role === 'user' && turn.parts[0]?.functionResponse ? null : (
            <TurnParts key={i} turn={turn} nextTurn={activeSession.turns[i + 1]} />
          ),
        )}
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
