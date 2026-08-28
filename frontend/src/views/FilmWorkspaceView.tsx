import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { VideoControls } from '../components/VideoControls';
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

type Tab = 'details' | 'progress';

export function FilmWorkspaceView({ passcode, testMode }: FilmWorkspaceViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'progress' ? 'progress' : 'details';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showKickoff, setShowKickoff] = useState(false);
  const [country, setCountry] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

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
    <div className="app-body-inner">
      <div className="page-header">
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
      </nav>

      <video
        ref={videoRef}
        className="film-video"
        src={toPlayableUrl(film.videoUrl)}
        onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000)}
        onTimeUpdate={(e) => setCurrentTimeMs(e.currentTarget.currentTime * 1000)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <VideoControls playing={playing} onTogglePlay={togglePlay} onSeekRelative={handleSeekRelative} onBack={() => navigate('/')} />
      <SubtitleDisplay entries={film.subtitle?.entries ?? []} currentTimeMs={currentTimeMs} />
      <VideoScrubber entries={film.subtitle?.entries ?? []} durationMs={durationMs} currentTimeMs={currentTimeMs} onSeek={handleSeek} />

      {tab === 'details' && (
        <>
          <p className="section-heading" style={{ marginTop: 24 }}>
            Details
          </p>
          <DetailsTable
            film={film}
            passcode={passcode}
            rows={rows}
            columns={columns}
            onRowAdded={addRow}
            onRowUpdated={updateRow}
            onRowDeleted={removeRow}
            onColumnAdded={addColumn}
          />

          {!showKickoff && (
            <button type="button" className="btn btn--primary" style={{ width: 'fit-content' }} onClick={() => setShowKickoff(true)}>
              ✨ Kick off agentic discovery
            </button>
          )}
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
              }}
              onClose={() => setShowKickoff(false)}
            />
          )}

          {rows.length > 0 && (
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
          )}
        </>
      )}

      {tab === 'progress' && (
        <div className="agent-progress-grid">
          <div>
            <p className="section-heading">Agent running</p>
            <AgentRunningList jobs={jobs} activeJobId={activeJobId} onSelect={setActiveJobId} />
          </div>
          <div>
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
        </div>
      )}
    </div>
  );
}
