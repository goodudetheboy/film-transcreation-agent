import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { deleteFilm, getFilm, listDetails, listDiscoveryJobs } from '../api/filmsApiClient';
import { useFilmWorkspaceStore } from '../store/filmWorkspaceStore';
import { toPlayableUrl } from '../utils/gsUrl';
import { TransportBar } from '../components/TransportBar';
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

const SCRUBBER_HEIGHT_STORAGE_KEY = 'workspace.scrubberHeight';
const MIN_SCRUBBER_HEIGHT = 84;
const MAX_SCRUBBER_HEIGHT = 400;
const DEFAULT_SCRUBBER_HEIGHT = 96;

function clampScrubberHeight(value: number): number {
  return Math.min(MAX_SCRUBBER_HEIGHT, Math.max(MIN_SCRUBBER_HEIGHT, value));
}

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
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showKickoff, setShowKickoff] = useState(false);

  const splitRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  const [scrubberHeight, setScrubberHeight] = useState(DEFAULT_SCRUBBER_HEIGHT);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);
  const scrubberDragStartRef = useRef<{ startY: number; startHeight: number } | null>(null);

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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SCRUBBER_HEIGHT_STORAGE_KEY);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) setScrubberHeight(clampScrubberHeight(parsed));
    } catch {
      // private mode / storage disabled — default height still works
    }
  }, []);

  // The <video> element's volume/muted aren't reactive props — they have to be
  // pushed onto the element imperatively, same as currentTime elsewhere here.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

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

  function handleScrubberDividerPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubberDragStartRef.current = { startY: e.clientY, startHeight: scrubberHeight };
    setIsDraggingScrubber(true);
  }

  function handleScrubberDividerPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = scrubberDragStartRef.current;
    if (!start) return;
    // The divider sits above the scrubber, so dragging it up should grow it.
    setScrubberHeight(clampScrubberHeight(start.startHeight - (e.clientY - start.startY)));
  }

  function handleScrubberDividerPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDraggingScrubber(false);
    scrubberDragStartRef.current = null;
    try {
      window.localStorage.setItem(SCRUBBER_HEIGHT_STORAGE_KEY, String(scrubberHeight));
    } catch {
      // private mode / storage disabled — resize still works, just won't persist
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

  function handleVolumeChange(next: number) {
    setVolume(next);
    // Dragging the slider up while muted should audibly un-mute, matching how
    // every real media player's volume slider behaves.
    if (next > 0 && muted) setMuted(false);
  }

  function toggleMute() {
    setMuted((m) => !m);
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
                <Link to={`/films/${film.id}/projects/new`} className="btn btn--primary" style={{ width: 'fit-content', marginTop: 20 }}>
                  New project from this film
                </Link>
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
          <TransportBar
            playing={playing}
            zoom={zoom}
            currentTimeMs={currentTimeMs}
            durationMs={durationMs}
            volume={volume}
            muted={muted}
            onTogglePlay={togglePlay}
            onSeekRelative={handleSeekRelative}
            onZoomIn={() => setZoom((z) => Math.min(2, z + 0.25))}
            onZoomOut={() => setZoom((z) => Math.max(1, z - 0.25))}
            onVolumeChange={handleVolumeChange}
            onToggleMute={toggleMute}
          />
        </div>
      </div>

      <div
        className={`workspace__scrubber-divider${isDraggingScrubber ? ' workspace__scrubber-divider--dragging' : ''}`}
        onPointerDown={handleScrubberDividerPointerDown}
        onPointerMove={handleScrubberDividerPointerMove}
        onPointerUp={handleScrubberDividerPointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the timeline scrubber"
      />
      <div className="workspace__scrubber-area" style={{ height: scrubberHeight }}>
        <VideoScrubber
          entries={film.subtitle?.entries ?? []}
          detailRows={rows}
          durationMs={durationMs}
          currentTimeMs={currentTimeMs}
          onSeek={handleSeek}
        />
      </div>

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
