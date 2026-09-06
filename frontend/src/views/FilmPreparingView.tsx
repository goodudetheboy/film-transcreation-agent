import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createFilm, getFilm, streamFilmPrep, uploadSubtitleFile, uploadVideoFile } from '../api/filmsApiClient';
import { useFilmPrepStore } from '../store/filmPrepStore';
import { PrepAnimation } from '../components/PrepAnimation';
import { ImportFilmForm } from './ImportFilmForm';
import { useStageDwell, STAGE_LABELS, MIN_STAGE_DWELL_MS } from '../utils/useStageDwell';
import { withMinDuration } from '../utils/withMinDuration';
import type { Film, FilmPrepStage } from '../api/apiClient.types';

export interface FilmPreparingViewProps {
  passcode: string;
  testMode: boolean;
}

function PrepHeader() {
  return (
    <div className="page-header__heading">
      <h1 className="page-header__title">Your film is being prepared</h1>
      <p className="page-header__subtitle">Hang tight — we're uploading and processing everything.</p>
    </div>
  );
}

/**
 * Doubles as both the "import a new film" step and the "watch it get
 * prepared" step, so the whole animated sequence — video uploading,
 * subtitle uploading, discovery running, finalizing, ready — plays out
 * contiguously on one screen instead of cutting away to a different page
 * partway through. Reached at `/films/new/preparing` (no film yet — shows
 * `ImportFilmForm`) or `/films/:id/preparing` (an existing film — streams
 * its real prep progress). See docs/progress/20260906.md for why the
 * upload stages used to live on a separate `/films/new` page and why that
 * was undone.
 */
export function FilmPreparingView({ passcode, testMode }: FilmPreparingViewProps) {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { prep, applyEvent, reset } = useFilmPrepStore();
  const [runDiscoveryOnCreate, setRunDiscoveryOnCreate] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filmId, setFilmId] = useState<string | null>(routeId && routeId !== 'new' ? routeId : null);
  const [title, setTitle] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [runDiscovery, setRunDiscovery] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<'video_uploading' | 'subtitle_uploading' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);

  useEffect(() => {
    if (routeId && routeId !== 'new' && routeId !== filmId) setFilmId(routeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    if (!filmId) return;
    reset();
    setLoadError(null);

    let cancelled = false;

    getFilm(filmId, passcode)
      .then((film: Film) => {
        if (cancelled) return;
        setRunDiscoveryOnCreate(film.runDiscoveryOnCreate);
        applyEvent({ type: 'prep_update', prep: film.prep });
        return streamFilmPrep(filmId, passcode, (event) => {
          if (!cancelled) applyEvent(event);
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load film');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmId, passcode]);

  const displayStage = useStageDwell(prep?.stage ?? null);
  const canSubmit = title.trim() !== '' && videoFile !== null && subtitleFile !== null;

  async function handleFormSubmit() {
    if (!canSubmit || !videoFile || !subtitleFile) return;
    setFormError(null);
    try {
      setUploadStage('video_uploading');
      setPhaseLabel(STAGE_LABELS.video_uploading);
      setUploadProgress(testMode ? null : 0);
      const { videoUrl } = await withMinDuration(
        uploadVideoFile(videoFile, { passcode, testMode }, undefined, setUploadProgress),
        MIN_STAGE_DWELL_MS,
      );
      setUploadProgress(null);

      setUploadStage('subtitle_uploading');
      setPhaseLabel(STAGE_LABELS.subtitle_uploading);
      const { subtitleUrl, format, entries } = await withMinDuration(
        uploadSubtitleFile(subtitleFile, { passcode, testMode }),
        MIN_STAGE_DWELL_MS,
      );

      setPhaseLabel('Creating your film…');
      const film = await createFilm({
        passcode,
        title,
        videoUrl,
        subtitleUrl,
        subtitleFormat: format,
        subtitleEntries: entries,
        runDiscovery,
        testMode,
      });

      setFilmId(film.id);
      navigate(`/films/${film.id}/preparing`, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'failed to import film');
      setUploadStage(null);
      setPhaseLabel(null);
      setUploadProgress(null);
    }
  }

  if (!filmId) {
    if (uploadStage) {
      return (
        <div className="app-body-inner app-body-inner--centered">
          <PrepHeader />
          <PrepAnimation stage={uploadStage} />
          <p className="prep-stage-label">{phaseLabel}</p>
          {uploadStage === 'video_uploading' && uploadProgress !== null && (
            <progress className="upload-progress" value={uploadProgress} max={1} aria-label="Video upload progress" />
          )}
        </div>
      );
    }

    return (
      <ImportFilmForm
        title={title}
        onTitleChange={setTitle}
        videoFile={videoFile}
        onVideoFile={setVideoFile}
        subtitleFile={subtitleFile}
        onSubtitleFile={setSubtitleFile}
        runDiscovery={runDiscovery}
        onRunDiscoveryChange={setRunDiscovery}
        canSubmit={canSubmit}
        error={formError}
        onSubmit={handleFormSubmit}
      />
    );
  }

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;

  const stageOrder: FilmPrepStage[] = runDiscoveryOnCreate
    ? ['video_uploading', 'subtitle_uploading', 'discovery_running', 'finalizing', 'ready']
    : ['video_uploading', 'subtitle_uploading', 'finalizing', 'ready'];
  const currentIndex = prep ? stageOrder.indexOf(displayStage as FilmPrepStage) : -1;
  const isReady = displayStage === 'ready';
  const isError = displayStage === 'error';

  return (
    <div className="app-body-inner app-body-inner--centered">
      <PrepHeader />

      <PrepAnimation stage={displayStage} />

      <p className="prep-stage-label">{isError ? prep?.errorMessage ?? STAGE_LABELS.error : STAGE_LABELS[displayStage]}</p>

      {prep && (
        <>
          <div className="prep-steps">
            {stageOrder.map((stage, i) => (
              <span
                key={stage}
                className={`prep-steps__dot${
                  isError && i === currentIndex
                    ? ' prep-steps__dot--error'
                    : i < currentIndex || isReady
                      ? ' prep-steps__dot--done'
                      : i === currentIndex
                        ? ' prep-steps__dot--active'
                        : ''
                }`}
              />
            ))}
          </div>

          {prep.log.length > 0 && (
            <details className="output-details">
              <summary className="section-heading">Activity log</summary>
              <ul className="content-list">
                {prep.log.map((entry, i) => (
                  <li key={i} className="content-card">
                    <p className="content-card__caption">{new Date(entry.ts).toLocaleTimeString()}</p>
                    <p className="content-card__secondary">{entry.message}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <button type="button" className="btn btn--primary" disabled={!isReady} onClick={() => navigate(`/films/${filmId}`)}>
        Start Creating
      </button>
    </div>
  );
}
