import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createProjectFromFilm, deleteFilm, getFilm, savePreprocessing } from '../api/filmsApiClient';
import { preprocessVideo } from '../api/apiClient';
import { buildTimeline, type TimelineEntry } from '../utils/timeline';
import { toPlayableUrl } from '../utils/gsUrl';
import { TimelineList } from '../components/TimelineList';
import { VideoMarkerTrack } from '../components/VideoMarkerTrack';
import type { Film } from '../api/apiClient.types';

export interface FilmDetailViewProps {
  passcode: string;
  testMode: boolean;
}

type DiscoverStatus = 'idle' | 'loading' | 'done' | 'error';

export function FilmDetailView({ passcode, testMode }: FilmDetailViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [film, setFilm] = useState<Film | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>('idle');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);

  const [country, setCountry] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    setFilm(null);
    setLoadError(null);
    setDiscoverStatus('idle');
    setTimeline([]);
    if (!id) return;

    let cancelled = false;
    getFilm(id, passcode)
      .then((f) => {
        if (cancelled) return;
        setFilm(f);
        if (f.preprocessing) {
          setTimeline(buildTimeline(f.preprocessing.dialogue, f.preprocessing.gestures));
          setDiscoverStatus('done');
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load film');
      });
    return () => {
      cancelled = true;
    };
  }, [id, passcode]);

  async function handleDiscoverAgent() {
    if (!film) return;

    setDiscoverStatus('loading');
    setDiscoverError(null);

    const result = await preprocessVideo({ videoUrl: film.videoUrl, passcode, testMode });
    if (result.ok) {
      setTimeline(buildTimeline(result.dialogue, result.gestures));
      setDiscoverStatus('done');
      try {
        const updated = await savePreprocessing(film.id, {
          passcode,
          dialogue: result.dialogue,
          gestures: result.gestures,
        });
        setFilm(updated);
      } catch {
        // The result is already shown from Gemini's response — failing to persist
        // it just means it won't survive a reload, not worth blocking the view on.
      }
    } else {
      setDiscoverError(result.message);
      setDiscoverStatus('error');
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

  return (
    <div className="panel-grid">
      <section className="panel panel--source">
        <div className="page-header">
          <div className="page-header__heading">
            <h1 className="page-header__title">{film.title}</h1>
          </div>
          <div className="page-header__actions">
            <span className={`status-badge status-badge--${film.status}`}>{film.status}</span>
            <button type="button" className="btn" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Film'}
            </button>
          </div>
        </div>

        <video
          className="film-video"
          src={toPlayableUrl(film.videoUrl)}
          controls
          onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
        />
        <VideoMarkerTrack duration={videoDuration} entries={timeline} />

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleDiscoverAgent}
            disabled={discoverStatus === 'loading'}
          >
            {discoverStatus === 'loading' ? 'Processing…' : 'Discover Agent'}
          </button>
        </div>

        {testMode && (
          <ul className="content-list">
            {film.details.map((d) => (
              <li className="content-card" key={d.id}>
                <p className="content-card__primary">
                  {d.scriptLine ? `“${d.scriptLine}”` : <em>Visual only</em>}
                </p>
                <p className="content-card__secondary">{d.sceneDescription}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel panel--output">
        <details className="output-details" open>
          <summary className="section-heading">Preprocessing Output</summary>
          {discoverStatus === 'loading' && (
            <p className="results-status" role="status">
              Processing (using Discovery agent)
            </p>
          )}
          {discoverStatus === 'error' && discoverError && (
            <p className="passcode-gate__error" role="alert">
              {discoverError}
            </p>
          )}
          {discoverStatus !== 'loading' && timeline.length === 0 && (
            <p className="results-placeholder">No dialogue or gestures logged yet.</p>
          )}
          {timeline.length > 0 && <TimelineList entries={timeline} />}
        </details>

        {discoverStatus === 'done' && (
          <form onSubmit={handleCreateProject} className="new-project-form" style={{ maxWidth: 480, marginTop: 20 }}>
            <div className="field">
              <label htmlFor="country">Target country</label>
              <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            {projectError && <p className="passcode-gate__error">{projectError}</p>}
            <button
              type="submit"
              className="btn btn--primary"
              disabled={creatingProject || country.trim() === ''}
            >
              {creatingProject ? 'Creating…' : 'Create Project'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
