import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createFilm, getFilm, streamFilmPrep, uploadSubtitleFile, uploadVideoFile } from '../api/filmsApiClient';
import { useFilmPrepStore } from '../store/filmPrepStore';
import { PrepAnimation } from '../components/PrepAnimation';
import { ImportFilmForm } from './ImportFilmForm';
import { useStageDwell, STAGE_LABELS, STAGE_HINTS, STEP_LABELS, MIN_STAGE_DWELL_MS } from '../utils/useStageDwell';
import { withMinDuration } from '../utils/withMinDuration';
import type { Film, FilmPrepStage } from '../api/apiClient.types';

export interface FilmPreparingViewProps {
  passcode: string;
  testMode: boolean;
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
      const hasRealProgress = uploadStage === 'video_uploading' && uploadProgress !== null;
      const pct = hasRealProgress ? Math.round((uploadProgress as number) * 100) : null;
      return (
        <div className="prep-hero">
          <div className="prep-hero__glow" aria-hidden="true" />
          <div className="prep-hero__content">
            <span className="prep-hero__eyebrow">Preparing your film</span>
            <PrepAnimation stage={uploadStage} />
            <div className="prep-hero__text">
              <h1 className="prep-hero__headline" key={phaseLabel}>
                {phaseLabel}
              </h1>
              <p className="prep-hero__hint">{STAGE_HINTS[uploadStage]}</p>
            </div>
            <div className={`prep-progress${hasRealProgress ? '' : ' prep-progress--indeterminate'}`}>
              <div className="prep-progress__track">
                <div className="prep-progress__fill" style={hasRealProgress ? { width: `${pct}%` } : undefined} />
              </div>
              {hasRealProgress && (
                <span className="prep-progress__pct" aria-label="Video upload progress">
                  {pct}%
                </span>
              )}
            </div>
          </div>
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
  const stepStages = stageOrder.filter((s) => s !== 'ready');

  return (
    <div className="prep-hero">
      <div
        className={`prep-hero__glow${isError ? ' prep-hero__glow--error' : isReady ? ' prep-hero__glow--ready' : ''}`}
        aria-hidden="true"
      />
      <div className="prep-hero__content">
        <span className="prep-hero__eyebrow">Preparing your film</span>

        <PrepAnimation stage={displayStage} />

        <div className="prep-hero__text">
          <h1 className="prep-hero__headline" key={displayStage}>
            {isError ? (prep?.errorMessage ?? STAGE_LABELS.error) : STAGE_LABELS[displayStage]}
          </h1>
          <p className="prep-hero__hint">{isError ? STAGE_HINTS.error : STAGE_HINTS[displayStage]}</p>
          {isError && (
            <button type="button" className="prep-hero__back-link" onClick={() => navigate('/')}>
              ← Back to Films
            </button>
          )}
        </div>

        {prep && !isReady && !isError && (
          <>
            <div className="prep-stepper">
              {stepStages.map((stage, i) => {
                const modifier = i < currentIndex ? 'done' : i === currentIndex ? 'active' : '';
                return (
                  <div key={stage} className="prep-stepper__step">
                    <span className={`prep-stepper__dot${modifier ? ` prep-stepper__dot--${modifier}` : ''}`} />
                    <span className={`prep-stepper__label${modifier ? ` prep-stepper__label--${modifier}` : ''}`}>
                      {STEP_LABELS[stage]}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="prep-progress prep-progress--indeterminate">
              <div className="prep-progress__track">
                <div className="prep-progress__fill" />
              </div>
            </div>
          </>
        )}

        <button type="button" className="btn btn--primary" disabled={!isReady} onClick={() => navigate(`/films/${filmId}`)}>
          Start Creating
        </button>
      </div>
    </div>
  );
}
