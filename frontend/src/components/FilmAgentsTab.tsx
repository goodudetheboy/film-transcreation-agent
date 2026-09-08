import { useEffect, useMemo, useRef, useState } from 'react';
import { listDiscoveryAgentSessions } from '../api/discoveryChatApiClient';
import { listDiscoveryJobs, streamDiscoveryJob } from '../api/filmsApiClient';
import { listChatSessions, listResearchRuns, streamResearchRunUpdates } from '../api/projectsApiClient';
import type { ChatSession, ChatSessionStatus, DiscoveryAgentSession, DiscoveryChatSessionStatus, EnrichedProject, ResearchRun } from '../api/apiClient.types';
import { countryCode } from '../data/countries';
import { Flag } from './Flag';
import { Modal } from './Modal';
import { MicroscopeIcon, SearchIcon } from './icons';
import { collectRunRefs, combinedAgentStatus, type RunLikeStatus } from '../utils/agentRunStatus';
import { AGENT_RUN_LABELS } from '../utils/statusLabels';

export interface FilmAgentsTabProps {
  filmId: string;
  passcode: string;
  /** This film's own projects (already filtered by sourceFilmId upstream). */
  projects: EnrichedProject[];
  onOpenDiscovery: (agentId?: string, autoCreate?: 'agent' | 'session') => void;
  onOpenResearch: (projectId: string, sessionId?: string, autoCreate?: 'agent' | 'session') => void;
}

/** Pre-combine shape — everything needed to compute a row's displayed status
 * except the live status patches, which arrive later and shouldn't force a
 * refetch of the session list itself. */
interface RawAgentRow {
  kind: 'discovery' | 'research';
  id: string;
  name: string;
  projectId?: string;
  projectCountry?: string;
  projectLabel?: string;
  chatStatus: DiscoveryChatSessionStatus | ChatSessionStatus;
  jobIds: string[];
  runIds: string[];
  updatedAt: string;
  lastMessagePreview: string | undefined;
}

interface AgentRow extends RawAgentRow {
  /** Already-combined status — the session's own chat-stream status folded
   * together with the status of any Discovery/Research Run it kicked off, via
   * combinedAgentStatus. Not just the raw session status: a session can read
   * "done" on its chat reply while the batch Run it started is still crunching
   * in the background, which is exactly the ambiguity this combines away. */
  status: 'running' | 'done' | 'error';
}

type TypeFilter = 'all' | 'discovery' | 'research';

interface ProjectSessionsAndRuns {
  p: EnrichedProject;
  sessions: ChatSession[];
  runs: ResearchRun[];
}

function lastTextPreview(session: DiscoveryAgentSession | ChatSession): string | undefined {
  return [...session.turns].reverse().find((t) => t.parts.some((p) => p.text))?.parts.find((p) => p.text)?.text;
}

export function FilmAgentsTab({ filmId, passcode, projects, onOpenDiscovery, onOpenResearch }: FilmAgentsTabProps) {
  const [rawRows, setRawRows] = useState<RawAgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickingProject, setPickingProject] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');

  // Snapshot statuses from the one-shot fetch below, keyed by jobId/runId —
  // read by the live-subscription effect to decide what's worth subscribing
  // to (an already-terminal job/run needs no subscription) and as the
  // fallback value for anything the subscription hasn't patched yet.
  const initialStatusByIdRef = useRef<Map<string, RunLikeStatus>>(new Map());
  // Patches from the per-job/run SSE streams below — starts empty and fills
  // in as events arrive, so a badge computed from combinedAgentStatus() keeps
  // updating (running -> done) without a page reload, the same way the
  // in-thread run cards in DiscoveryChatPanel/ResearchChatPanel already do.
  const [liveStatusById, setLiveStatusById] = useState<Record<string, RunLikeStatus>>({});
  const subscribedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [discoverySessions, discoveryJobs, researchSettled] = await Promise.all([
          listDiscoveryAgentSessions(filmId, passcode),
          listDiscoveryJobs(filmId, passcode),
          Promise.allSettled(
            projects.map((p) =>
              Promise.all([listChatSessions(p.id, passcode), listResearchRuns(p.id, passcode)]).then(([sessions, runs]) => ({ p, sessions, runs })),
            ),
          ),
        ]);
        if (cancelled) return;

        const fulfilledProjects = researchSettled.filter(
          (r): r is PromiseFulfilledResult<ProjectSessionsAndRuns> => r.status === 'fulfilled',
        );
        initialStatusByIdRef.current = new Map([
          ...discoveryJobs.map((j) => [j.id, j.status] as const),
          ...fulfilledProjects.flatMap((r) => r.value.runs.map((run) => [run.id, run.status] as const)),
        ]);
        subscribedIdsRef.current = new Set();
        setLiveStatusById({});

        const discoveryRows: RawAgentRow[] = discoverySessions.map((s) => ({
          kind: 'discovery',
          id: s.id,
          name: s.name ?? `Agent #${s.agentNumber}`,
          chatStatus: s.status,
          jobIds: collectRunRefs(s.turns).jobIds,
          runIds: [],
          updatedAt: s.updatedAt,
          lastMessagePreview: lastTextPreview(s),
        }));
        const researchRows: RawAgentRow[] = fulfilledProjects.flatMap((r) =>
          r.value.sessions.map((s) => ({
            kind: 'research' as const,
            id: s.id,
            name: s.name ?? `Session ${s.sessionNumber}`,
            projectId: r.value.p.id,
            projectCountry: r.value.p.country,
            projectLabel: r.value.p.note ? `${r.value.p.country} — ${r.value.p.note}` : r.value.p.country,
            chatStatus: s.status,
            jobIds: [],
            runIds: collectRunRefs(s.turns).runIds,
            updatedAt: s.updatedAt,
            lastMessagePreview: lastTextPreview(s),
          })),
        );

        setRawRows([...discoveryRows, ...researchRows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load agents');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filmId, passcode, projects]);

  // Subscribe to every non-terminal job/run's own resumable stream so its
  // status keeps updating live — same primitive (streamDiscoveryJob/
  // streamResearchRunUpdates) the chat panels already use for their in-thread
  // run cards, just applied across every row here instead of only the active
  // session's. An already-`done`/`error` job needs no subscription; each
  // stream also closes itself once it reaches a terminal status.
  useEffect(() => {
    if (!rawRows) return;
    for (const row of rawRows) {
      const ids = row.kind === 'discovery' ? row.jobIds : row.runIds;
      for (const id of ids) {
        const status = initialStatusByIdRef.current.get(id);
        if (!status || status === 'done' || status === 'error') continue;
        if (subscribedIdsRef.current.has(id)) continue;
        subscribedIdsRef.current.add(id);
        if (row.kind === 'discovery') {
          streamDiscoveryJob(filmId, id, passcode, (event) => {
            setLiveStatusById((prev) => ({ ...prev, [id]: event.job.status }));
          });
        } else {
          streamResearchRunUpdates(row.projectId!, id, passcode, (event) => {
            setLiveStatusById((prev) => ({ ...prev, [id]: event.run.status }));
          });
        }
      }
    }
  }, [rawRows, filmId, passcode]);

  const rows = useMemo<AgentRow[] | null>(() => {
    if (rawRows === null) return null;
    return rawRows.map((r) => {
      const ids = r.kind === 'discovery' ? r.jobIds : r.runIds;
      const statuses = ids
        .map((id) => liveStatusById[id] ?? initialStatusByIdRef.current.get(id))
        .filter((v): v is RunLikeStatus => v !== undefined);
      return { ...r, status: combinedAgentStatus(r.chatStatus, statuses) };
    });
  }, [rawRows, liveStatusById]);

  const filteredRows = useMemo(() => {
    if (rows === null) return null;
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.kind !== typeFilter) return false;
      if (projectFilter !== 'all' && row.projectId !== projectFilter) return false;
      return true;
    });
  }, [rows, typeFilter, projectFilter]);

  const runningCount = rows?.filter((r) => r.status === 'running').length ?? 0;

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
            <SearchIcon /> Create Agent
          </button>
          <button type="button" className="btn" onClick={handleCreateSession} disabled={projects.length === 0} title={projects.length === 0 ? 'Add a project first' : undefined}>
            + Create Session
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <span className="filter-bar__label">Type</span>
        <button type="button" className={`filter-pill${typeFilter === 'all' ? ' filter-pill--active' : ''}`} onClick={() => setTypeFilter('all')}>
          All
        </button>
        <button
          type="button"
          className={`filter-pill${typeFilter === 'discovery' ? ' filter-pill--active' : ''}`}
          onClick={() => setTypeFilter((k) => (k === 'discovery' ? 'all' : 'discovery'))}
        >
          <SearchIcon width={12} height={12} /> Discovery
        </button>
        <button
          type="button"
          className={`filter-pill${typeFilter === 'research' ? ' filter-pill--active' : ''}`}
          onClick={() => setTypeFilter((k) => (k === 'research' ? 'all' : 'research'))}
        >
          <MicroscopeIcon width={12} height={12} /> Research
        </button>
      </div>

      {typeFilter !== 'discovery' && projects.length > 1 && (
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
                {row.kind === 'discovery' ? <SearchIcon width={18} height={18} /> : <MicroscopeIcon width={18} height={18} />}
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
                <span className={`status-badge status-badge--${row.status}`}>
                  <span className={`status-dot${row.status === 'running' ? ' status-dot--running' : ''}`} /> {AGENT_RUN_LABELS[row.status]}
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
