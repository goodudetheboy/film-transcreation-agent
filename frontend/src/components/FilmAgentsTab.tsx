import { useEffect, useMemo, useState } from 'react';
import { listDiscoveryAgentSessions } from '../api/discoveryChatApiClient';
import { listChatSessions } from '../api/projectsApiClient';
import type { ChatSession, ChatSessionStatus, DiscoveryAgentSession, DiscoveryChatSessionStatus, EnrichedProject } from '../api/apiClient.types';
import { countryCode } from '../data/countries';
import { Flag } from './Flag';
import { Modal } from './Modal';
import { SearchIcon, SparkleIcon } from './icons';

export interface FilmAgentsTabProps {
  filmId: string;
  passcode: string;
  /** This film's own projects (already filtered by sourceFilmId upstream). */
  projects: EnrichedProject[];
  onOpenDiscovery: (agentId?: string, autoCreate?: 'agent' | 'session') => void;
  onOpenResearch: (projectId: string, sessionId?: string, autoCreate?: 'agent' | 'session') => void;
}

interface AgentRow {
  kind: 'discovery' | 'research';
  id: string;
  name: string;
  projectId?: string;
  projectCountry?: string;
  projectLabel?: string;
  status: DiscoveryChatSessionStatus | ChatSessionStatus;
  updatedAt: string;
  lastMessagePreview: string | undefined;
}

type KindFilter = 'all' | 'discovery' | 'research';

function lastTextPreview(session: DiscoveryAgentSession | ChatSession): string | undefined {
  return [...session.turns].reverse().find((t) => t.parts.some((p) => p.text))?.parts.find((p) => p.text)?.text;
}

function statusModifier(status: DiscoveryChatSessionStatus | ChatSessionStatus): 'running' | 'done' | 'error' {
  if (status === 'streaming') return 'running';
  if (status === 'error') return 'error';
  return 'done';
}

function statusLabel(status: DiscoveryChatSessionStatus | ChatSessionStatus): string {
  if (status === 'streaming') return 'running';
  if (status === 'error') return 'error';
  return 'done';
}

export function FilmAgentsTab({ filmId, passcode, projects, onOpenDiscovery, onOpenResearch }: FilmAgentsTabProps) {
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickingProject, setPickingProject] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [discoverySessions, researchSettled] = await Promise.all([
          listDiscoveryAgentSessions(filmId, passcode),
          Promise.allSettled(projects.map((p) => listChatSessions(p.id, passcode).then((sessions) => ({ p, sessions })))),
        ]);
        if (cancelled) return;

        const discoveryRows: AgentRow[] = discoverySessions.map((s) => ({
          kind: 'discovery',
          id: s.id,
          name: s.name ?? `Agent #${s.agentNumber}`,
          status: s.status,
          updatedAt: s.updatedAt,
          lastMessagePreview: lastTextPreview(s),
        }));
        const researchRows: AgentRow[] = researchSettled
          .filter((r): r is PromiseFulfilledResult<{ p: EnrichedProject; sessions: ChatSession[] }> => r.status === 'fulfilled')
          .flatMap((r) =>
            r.value.sessions.map((s) => ({
              kind: 'research' as const,
              id: s.id,
              name: s.name ?? `Session ${s.sessionNumber}`,
              projectId: r.value.p.id,
              projectCountry: r.value.p.country,
              projectLabel: r.value.p.note ? `${r.value.p.country} — ${r.value.p.note}` : r.value.p.country,
              status: s.status,
              updatedAt: s.updatedAt,
              lastMessagePreview: lastTextPreview(s),
            })),
          );

        setRows([...discoveryRows, ...researchRows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load agents');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filmId, passcode, projects]);

  const filteredRows = useMemo(() => {
    if (rows === null) return null;
    return rows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
      if (projectFilter !== 'all' && row.projectId !== projectFilter) return false;
      return true;
    });
  }, [rows, kindFilter, projectFilter]);

  const runningCount = rows?.filter((r) => r.status === 'streaming').length ?? 0;

  function openRow(row: AgentRow) {
    if (row.kind === 'discovery') onOpenDiscovery(row.id);
    else onOpenResearch(row.projectId!, row.id);
  }

  function handleCreateSession() {
    if (projects.length === 0) return;
    if (projects.length === 1) {
      onOpenResearch(projects[0].id, undefined, 'session');
      return;
    }
    setPickingProject(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-snug)', flex: 1, minHeight: 0 }}>
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title" style={{ fontSize: '1.1rem' }}>
            Agent Status
          </h1>
          <p className="page-header__subtitle">
            Every Discovery agent and Research agent for this film
            {runningCount > 0 && (
              <>
                {' '}
                ·{' '}
                <span className="status-badge status-badge--running">
                  <span className="status-dot status-dot--running" /> {runningCount} running now
                </span>
              </>
            )}
          </p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={() => onOpenDiscovery(undefined, 'agent')}>
            <SparkleIcon /> Create Agent
          </button>
          <button type="button" className="btn" onClick={handleCreateSession} disabled={projects.length === 0} title={projects.length === 0 ? 'Add a project first' : undefined}>
            + Create Session
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <span className="filter-bar__label">Kind</span>
        <button type="button" className={`filter-pill${kindFilter === 'all' ? ' filter-pill--active' : ''}`} onClick={() => setKindFilter('all')}>
          All
        </button>
        <button
          type="button"
          className={`filter-pill${kindFilter === 'discovery' ? ' filter-pill--active' : ''}`}
          onClick={() => setKindFilter((k) => (k === 'discovery' ? 'all' : 'discovery'))}
        >
          <SparkleIcon width={12} height={12} /> Discovery
        </button>
        <button
          type="button"
          className={`filter-pill${kindFilter === 'research' ? ' filter-pill--active' : ''}`}
          onClick={() => setKindFilter((k) => (k === 'research' ? 'all' : 'research'))}
        >
          <SearchIcon width={12} height={12} /> Research
        </button>
      </div>

      {kindFilter !== 'discovery' && projects.length > 1 && (
        <div className="filter-bar">
          <span className="filter-bar__label">Project</span>
          <button type="button" className={`filter-pill${projectFilter === 'all' ? ' filter-pill--active' : ''}`} onClick={() => setProjectFilter('all')}>
            All Projects
          </button>
          {projects.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`filter-pill${projectFilter === p.id ? ' filter-pill--active' : ''}`}
              onClick={() => setProjectFilter((f) => (f === p.id ? 'all' : p.id))}
            >
              <Flag code={countryCode(p.country)} className="list-row__flag" /> {p.country}
            </button>
          ))}
        </div>
      )}

      {error && <p className="passcode-gate__error">{error}</p>}
      {filteredRows === null && !error && <p className="results-placeholder">Loading…</p>}
      {filteredRows !== null && filteredRows.length === 0 && (
        <p className="results-placeholder">
          {rows && rows.length > 0 ? 'Nothing matches this filter.' : 'No Agents or Sessions yet — create one to get started.'}
        </p>
      )}

      {filteredRows !== null && filteredRows.length > 0 && (
        <div className="list-row-group" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {filteredRows.map((row) => (
            <div key={`${row.kind}-${row.id}`} role="button" tabIndex={0} className="list-row" onClick={() => openRow(row)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openRow(row)}>
              <span className={`list-row__icon${row.kind === 'research' ? ' list-row__icon--research' : ''}`}>
                {row.kind === 'discovery' ? <SparkleIcon width={18} height={18} /> : <SearchIcon width={18} height={18} />}
              </span>

              <div className="list-row__body">
                <div className="list-row__title-line">
                  <span className="list-row__name">{row.name}</span>
                  {row.kind === 'research' && row.projectCountry && (
                    <span className="list-row__country">
                      <Flag code={countryCode(row.projectCountry)} className="list-row__flag" /> {row.projectLabel}
                    </span>
                  )}
                </div>
                {row.lastMessagePreview && <span className="list-row__preview">{row.lastMessagePreview}</span>}
              </div>

              <div className="list-row__side">
                <span className={`status-badge status-badge--${statusModifier(row.status)}`}>
                  <span className={`status-dot${row.status === 'streaming' ? ' status-dot--running' : ''}`} /> {statusLabel(row.status)}
                </span>
                <span className="list-row__meta">{new Date(row.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickingProject && (
        <Modal title="Create Session — pick a project" onClose={() => setPickingProject(false)}>
          <div className="list-row-group" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {projects.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                className="list-row"
                onClick={() => {
                  setPickingProject(false);
                  onOpenResearch(p.id, undefined, 'session');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setPickingProject(false);
                    onOpenResearch(p.id, undefined, 'session');
                  }
                }}
              >
                <span className="list-row__icon">
                  <Flag code={countryCode(p.country)} />
                </span>
                <div className="list-row__body">
                  <span className="list-row__name">{p.country}</span>
                  {p.note && <span className="list-row__preview">{p.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
