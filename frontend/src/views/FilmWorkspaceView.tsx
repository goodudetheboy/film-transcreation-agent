import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createProjectFromFilm,
  deleteFilm,
  getFilm,
  listDetails,
  listDiscoveryJobs,
} from '../api/filmsApiClient';
import { useFilmWorkspaceStore } from '../store/filmWorkspaceStore';
import { toPlayableUrl } from '../utils/gsUrl';
import { VerticalToolbar } from '../components/VerticalToolbar';
import { SubtitleDisplay } from '../components/SubtitleDisplay';
import { VideoScrubber } from '../components/VideoScrubber';
import { DetailsTable } from '../components/DetailsTable';
import { AgentKickoffPanel } from '../components/AgentKickoffPanel';
import { AgentRunningList } from '../components/AgentRunningList';
import { AgentStatusPanel } from '../components/AgentStatusPanel';

export interface FilmWorkspaceViewProps {
  passcode: string;
  testMode: boolean;
}

type Tab = 'details' | 'progress' | 'project';

const LEFT_WIDTH_STORAGE_KEY = 'workspace.leftPanelWidth';
const MIN_LEFT = 360;
const MIN_RIGHT = 360;
const DIVIDER_WIDTH = 6;
const DEFAULT_LEFT_RATIO = 0.62;
const DESKTOP_BREAKPOINT = 960;

function clampLeftWidth(value: number, containerWidth: number): number {
  const maxLeft = Math.max(MIN_LEFT, containerWidth - MIN_RIGHT - DIVIDER_WIDTH);
  return Math.min(Math.max(value, MIN_LEFT), maxLeft);
}

export function FilmWorkspaceView({ passcode, testMode }: FilmWorkspaceViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'progress' ? 'progress' : tabParam === 'project' ? 'project' : 'details';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showKickoff, setShowKickoff] = useState(false);
  const [country, setCountry] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const splitRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  const {
    film,
    rows,
    columns,
    jobs,
    jobDetails,
    activeJobId,
    setFilm,
    setDetails,
    setJobs,
    setActiveJobId,
    applyJobEvent,
    addRow,
    updateRow,
    removeRow,
    addColumn,
    reset,
  } = useFilmWorkspaceStore();

  useEffect(() => {
    reset();
    setLoadError(null);
    if (!id) return;
    let cancelled = false;

    Promise.all([getFilm(id, passcode), listDetails(id, passcode), listDiscoveryJobs(id, passcode)])
      .then(([f, details, jobsList]) => {
        if (cancelled) return;
        setFilm(f);
        setDetails(details.rows, details.columns);
        setJobs(jobsList);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load film');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, passcode]);

  useLayoutEffect(() => {
    const container = splitRef.current;
    if (!container) return;

    function readStored(): number | null {
      try {
        const raw = window.localStorage.getItem(LEFT_WIDTH_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } catch {
        return null;
      }
    }

    function apply(width: number) {
      const desktop = width > DESKTOP_BREAKPOINT;
      setIsDesktop(desktop);
      // Below the breakpoint, CSS owns the (stacked, single-column) layout and this
      // value isn't rendered — skip reclamping so a narrow excursion doesn't pin
      // leftWidth down near MIN_LEFT and lose the desktop split once width returns.
      if (!desktop) return;
      setLeftWidth((prev) => {
        const base = prev ?? readStored() ?? width * DEFAULT_LEFT_RATIO;
        return clampLeftWidth(base, width);
      });
    }

    apply(container.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width != null) apply(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [film]);

  function handleDividerPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function handleDividerPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDragging || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    setLeftWidth(clampLeftWidth(e.clientX - rect.left, rect.width));
  }

  function handleDividerPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    if (leftWidth != null) {
      try {
        window.localStorage.setItem(LEFT_WIDTH_STORAGE_KEY, String(leftWidth));
      } catch {
        // private mode / storage disabled — resize still works, just won't persist
      }
    }
  }

  function setTab(next: Tab) {
    setSearchParams(next === 'details' ? {} : { tab: next });
  }

  function handleSeek(ms: number) {
    if (videoRef.current) videoRef.current.currentTime = ms / 1000;
    setCurrentTimeMs(ms);
  }

  function handleSeekRelative(deltaSeconds: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + deltaSeconds);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  async function handleDelete() {
    if (!film) return;
    if (!window.confirm(`Delete "${film.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteFilm(film.id, passcode);
      navigate('/');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'failed to delete film');
      setDeleting(false);
    }
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!film || country.trim() === '') return;
    setCreatingProject(true);
    setProjectError(null);
    try {
      const project = await createProjectFromFilm(film.id, { passcode, country });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'failed to create project');
      setCreatingProject(false);
    }
  }

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!film) return <p className="results-placeholder">Loading…</p>;

  const activeJob = activeJobId ? jobDetails[activeJobId] : undefined;
  const agentNumbers = [...new Set(jobs.map((j) => j.agentNumber))].sort((a, b) => a - b);

  return (
    <div className="workspace">
      <div className="workspace__header">
        <div className="page-header__heading">
          <h1 className="page-header__title">{film.title}</h1>
        </div>
        <div className="page-header__actions">
          <span className={`status-badge status-badge--${film.status === 'processed' ? 'done' : 'running'}`}>{film.status}</span>
          <button type="button" className="btn" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete Film'}
          </button>
        </div>
      </div>

      <nav className="workspace-tabs">
        <button type="button" className={`workspace-tabs__tab${tab === 'details' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('details')}>
          Details
        </button>
        <button type="button" className={`workspace-tabs__tab${tab === 'progress' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('progress')}>
          Progress
        </button>
        <button type="button" className={`workspace-tabs__tab${tab === 'project' ? ' workspace-tabs__tab--active' : ''}`} onClick={() => setTab('project')}>
          Project
        </button>
      </nav>

      <div
        className="workspace__split"
        ref={splitRef}
        style={isDesktop && leftWidth != null ? { gridTemplateColumns: `${leftWidth}px 6px 1fr` } : undefined}
      >
        <div className="workspace__panel workspace__panel--left">
          {tab === 'details' && (
            <>
              <p className="section-heading">Details</p>
              <DetailsTable
                film={film}
                passcode={passcode}
                rows={rows}
                columns={columns}
                currentTimeMs={currentTimeMs}
                durationMs={durationMs}
                onSeek={handleSeek}
                onRowAdded={addRow}
                onRowUpdated={updateRow}
                onRowDeleted={removeRow}
                onColumnAdded={addColumn}
              />

              <button type="button" className="btn btn--primary" style={{ width: 'fit-content' }} onClick={() => setShowKickoff(true)}>
                ✨ Kick off agentic discovery
              </button>
            </>
          )}

          {tab === 'project' && (
            <>
              <p className="section-heading">Project</p>
              {rows.length > 0 ? (
                <form onSubmit={handleCreateProject} className="new-project-form" style={{ maxWidth: 480, marginTop: 20 }}>
                  <div className="field">
                    <label htmlFor="country">Target country</label>
                    <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                  {projectError && <p className="passcode-gate__error">{projectError}</p>}
                  <button type="submit" className="btn btn--primary" disabled={creatingProject || country.trim() === ''}>
                    {creatingProject ? 'Creating…' : 'Create Project'}
                  </button>
                </form>
              ) : (
                <p className="results-placeholder">Add at least one detail row before creating a project.</p>
              )}
            </>
          )}

          {tab === 'progress' && (
            <>
              <p className="section-heading">Agent running</p>
              <AgentRunningList jobs={jobs} activeJobId={activeJobId} onSelect={setActiveJobId} />
              <div style={{ marginTop: 20 }}>
                {activeJobId ? (
                  <AgentStatusPanel
                    filmId={film.id}
                    passcode={passcode}
                    jobId={activeJobId}
                    job={activeJob}
                    columns={columns}
                    onJobEvent={applyJobEvent}
                    onRowMerged={addRow}
                  />
                ) : (
                  <p className="results-placeholder">Select a pass from the list to see its status.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div
          className={`workspace__divider${isDragging ? ' workspace__divider--dragging' : ''}`}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerUp}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize details and video panels"
        />

        <div className="workspace__panel workspace__panel--video">
          <div className="video-stage">
            <div className="video-stage__frame" style={{ transform: `scale(${zoom})` }}>
              <video
                ref={videoRef}
                className="film-video"
                src={toPlayableUrl(film.videoUrl)}
                onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000)}
                onTimeUpdate={(e) => setCurrentTimeMs(e.currentTarget.currentTime * 1000)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            </div>
            <SubtitleDisplay entries={film.subtitle?.entries ?? []} currentTimeMs={currentTimeMs} />
          </div>
          <VerticalToolbar
            playing={playing}
            zoom={zoom}
            onTogglePlay={togglePlay}
            onSeekRelative={handleSeekRelative}
            onZoomIn={() => setZoom((z) => Math.min(2, z + 0.25))}
            onZoomOut={() => setZoom((z) => Math.max(1, z - 0.25))}
            onBack={() => navigate('/')}
          />
        </div>
      </div>

      <VideoScrubber entries={film.subtitle?.entries ?? []} durationMs={durationMs} currentTimeMs={currentTimeMs} onSeek={handleSeek} />

      {showKickoff && (
        <AgentKickoffPanel
          filmId={film.id}
          passcode={passcode}
          testMode={testMode}
          existingAgentNumbers={agentNumbers}
          columns={columns}
          onCreated={(job) => {
            applyJobEvent({ type: 'job_update', job });
            setActiveJobId(job.id);
            setTab('progress');
          }}
          onClose={() => setShowKickoff(false)}
        />
      )}
    </div>
  );
}
