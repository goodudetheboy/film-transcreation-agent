import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFilm, streamFilmPrep } from '../api/filmsApiClient';
import { useFilmPrepStore } from '../store/filmPrepStore';
import { PrepAnimation } from '../components/PrepAnimation';
import { useStageDwell, type DisplayPrepStage } from '../utils/useStageDwell';
import type { Film, FilmPrepStage } from '../api/apiClient.types';

export interface FilmPreparingViewProps {
  passcode: string;
}

const STAGE_LABELS: Record<DisplayPrepStage, string> = {
  preparing: 'Your film is being prepared…',
  video_uploading: 'Uploading your video…',
  subtitle_uploading: 'Uploading your script…',
  discovery_running: 'Searching the video for details…',
  finalizing: 'Wrapping up the last few details…',
  ready: 'Your film is up and ready!',
  error: 'Something went wrong.',
};

export function FilmPreparingView({ passcode }: FilmPreparingViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { prep, applyEvent, reset } = useFilmPrepStore();
  const [runDiscoveryOnCreate, setRunDiscoveryOnCreate] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    reset();
    setLoadError(null);
    if (!id) return;

    let cancelled = false;

    getFilm(id, passcode)
      .then((film: Film) => {
        if (cancelled) return;
        setRunDiscoveryOnCreate(film.runDiscoveryOnCreate);
        applyEvent({ type: 'prep_update', prep: film.prep });
        return streamFilmPrep(id, passcode, (event) => {
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
  }, [id, passcode]);

  const displayStage = useStageDwell(prep?.stage ?? null);

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;

  const stageOrder: FilmPrepStage[] = runDiscoveryOnCreate
    ? ['video_uploading', 'subtitle_uploading', 'discovery_running', 'finalizing', 'ready']
    : ['video_uploading', 'subtitle_uploading', 'finalizing', 'ready'];
  const currentIndex = prep ? stageOrder.indexOf(displayStage as FilmPrepStage) : -1;
  const isReady = displayStage === 'ready';
  const isError = displayStage === 'error';

  return (
    <div className="app-body-inner app-body-inner--centered">
      <div className="page-header__heading">
        <h1 className="page-header__title">Your film is being prepared</h1>
        <p className="page-header__subtitle">Hang tight — we're uploading and processing everything.</p>
      </div>

      <PrepAnimation stage={isError ? 'finalizing' : displayStage} />

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

      <button type="button" className="btn btn--primary" disabled={!isReady} onClick={() => id && navigate(`/films/${id}`)}>
        Start Creating
      </button>
    </div>
  );
}
