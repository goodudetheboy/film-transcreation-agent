import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listFilms } from '../api/filmsApiClient';
import { listDiscoveryAgentSessions } from '../api/discoveryChatApiClient';
import { listProjects, listChatSessions } from '../api/projectsApiClient';
import type { ChatSession, DiscoveryAgentSession, Film, EnrichedProject } from '../api/apiClient.types';
import { EntityPickerModal } from '../components/EntityPickerModal';
import { SparkleIcon } from '../components/icons';

export interface AgentsLibraryViewProps {
  passcode: string;
}

interface AgentRow {
  kind: 'discovery' | 'research';
  id: string;
  name: string;
  parentId: string;
  parentTitle: string;
  updatedAt: string;
  lastMessagePreview: string | undefined;
  /** Discovery: the film's own id (== parentId). Research: the project's
   * sourceFilmId — a Research session is deep-linked via the film's
   * workspace, same as ProjectsLibraryView's own navigation. */
  targetFilmId: string;
}

function lastTextPreview(session: DiscoveryAgentSession | ChatSession): string | undefined {
  return [...session.turns].reverse().find((t) => t.parts.some((p) => p.text))?.parts.find((p) => p.text)?.text;
}

function discoveryRow(session: DiscoveryAgentSession, film: Film): AgentRow {
  return {
    kind: 'discovery',
    id: session.id,
    name: session.name ?? `Agent #${session.agentNumber}`,
    parentId: film.id,
    parentTitle: film.title,
    updatedAt: session.updatedAt,
    lastMessagePreview: lastTextPreview(session),
    targetFilmId: film.id,
  };
}

function researchRow(session: ChatSession, project: EnrichedProject): AgentRow {
  return {
    kind: 'research',
    id: session.id,
    name: session.name ?? `Session ${session.sessionNumber}`,
    parentId: project.id,
    parentTitle: project.name,
    updatedAt: session.updatedAt,
    lastMessagePreview: lastTextPreview(session),
    targetFilmId: project.sourceFilmId,
  };
}

export function AgentsLibraryView({ passcode }: AgentsLibraryViewProps) {
  const navigate = useNavigate();
  const [films, setFilms] = useState<Film[] | null>(null);
  const [projects, setProjects] = useState<EnrichedProject[] | null>(null);
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'agent' | 'session' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [filmList, projectList] = await Promise.all([listFilms(passcode), listProjects(passcode)]);
        if (cancelled) return;
        setFilms(filmList);
        setProjects(projectList);

        const [discoverySettled, researchSettled] = await Promise.all([
          Promise.allSettled(filmList.map((f) => listDiscoveryAgentSessions(f.id, passcode).then((sessions) => ({ f, sessions })))),
          Promise.allSettled(projectList.map((p) => listChatSessions(p.id, passcode).then((sessions) => ({ p, sessions })))),
        ]);
        if (cancelled) return;

        const discoveryRows = discoverySettled
          .filter((r): r is PromiseFulfilledResult<{ f: Film; sessions: DiscoveryAgentSession[] }> => r.status === 'fulfilled')
          .flatMap((r) => r.value.sessions.map((s) => discoveryRow(s, r.value.f)));
        const researchRows = researchSettled
          .filter((r): r is PromiseFulfilledResult<{ p: EnrichedProject; sessions: ChatSession[] }> => r.status === 'fulfilled')
          .flatMap((r) => r.value.sessions.map((s) => researchRow(s, r.value.p)));

        setRows([...discoveryRows, ...researchRows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load agents');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passcode]);

  function openRow(row: AgentRow) {
    if (row.kind === 'discovery') {
      navigate(`/films/${row.targetFilmId}?openDiscovery=1&agentId=${row.id}`);
    } else {
      navigate(`/films/${row.targetFilmId}?tab=project&projectId=${row.parentId}&openAgents=1&sessionId=${row.id}`);
    }
  }

  return (
    <div className="app-body-inner">
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title">Agents</h1>
          <p className="page-header__subtitle">Every Discovery agent and Research agent, across every film and project.</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={() => setPicker('agent')}>
            <SparkleIcon /> Create Agent
          </button>
          <button type="button" className="btn" onClick={() => setPicker('session')}>
            + Create Session
          </button>
        </div>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}
      {rows === null && !error && <p className="results-placeholder">Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="results-placeholder">No Agents or Sessions yet — create one to get started.</p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="chat-panel__library">
          {rows.map((row) => (
            <div key={`${row.kind}-${row.id}`} role="button" tabIndex={0} className="chat-panel__library-item" onClick={() => openRow(row)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openRow(row)}>
              <span className="chat-panel__library-item-name">
                {row.kind === 'discovery' ? 'Discovery' : 'Research'} · {row.name} — {row.parentTitle}
              </span>
              {row.lastMessagePreview && <span className="chat-panel__library-item-preview">{row.lastMessagePreview}</span>}
              <span className="chat-panel__library-item-meta">{new Date(row.updatedAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {picker && films !== null && projects !== null && (
        <EntityPickerModal
          autoCreate={picker}
          films={films}
          projects={projects}
          onClose={() => setPicker(null)}
          onPick={(target) => {
            if (target.kind === 'film') {
              navigate(`/films/${target.id}?openDiscovery=1&autoCreate=${picker}`);
            } else {
              navigate(`/films/${target.sourceFilmId}?tab=project&projectId=${target.id}&openAgents=1&autoCreate=${picker}`);
            }
          }}
        />
      )}
    </div>
  );
}
