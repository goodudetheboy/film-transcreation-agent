import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFilm, streamFilmPrep } from '../api/filmsApiClient';
import { useFilmPrepStore } from '../store/filmPrepStore';
import { PrepStage, type PrepStageState } from '../components/PrepStage';
import type { Film } from '../api/apiClient.types';

export interface FilmPreparingViewProps {
  passcode: string;
}

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

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!prep) return <p className="results-placeholder">Loading…</p>;

  const stageOrder = ['video_uploading', 'subtitle_uploading', 'discovery_running', 'finalizing', 'ready'];
  const currentIndex = stageOrder.indexOf(prep.stage);

  function stateFor(stage: string, done: boolean): PrepStageState {
    if (prep!.stage === 'error') return currentIndex === -1 || stageOrder.indexOf(stage) <= 0 ? 'done' : 'pending';
    if (done) return 'done';
    if (stage === prep!.stage) return 'active';
    return stageOrder.indexOf(stage) < currentIndex ? 'done' : 'pending';
  }

  const isReady = prep.stage === 'ready';
  const isError = prep.stage === 'error';

  return (
    <div className="app-body-inner app-body-inner--centered">
      <div className="page-header__heading">
        <h1 className="page-header__title">Your film is being prepared</h1>
        <p className="page-header__subtitle">Hang tight — we're uploading and processing everything.</p>
      </div>

      <div className="prep-stage-list">
        <PrepStage label="Uploading your video" state={prep.videoDone ? 'done' : 'active'} />
        <PrepStage label="Uploading your script" state={prep.subtitleDone ? 'done' : 'active'} />
        <PrepStage
          label="Searching the video for details"
          state={runDiscoveryOnCreate ? stateFor('discovery_running', prep.discoveryDone) : 'skipped'}
        />
        <PrepStage label="Finalizing" state={stateFor('finalizing', prep.finalizeDone)} />
        <PrepStage label="Your film is up and ready!" state={isReady ? 'done' : isError ? 'error' : 'pending'} />
      </div>

      {isError && (
        <p className="passcode-gate__error" role="alert">
          {prep.errorMessage ?? 'Something went wrong while preparing this film.'}
        </p>
      )}

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

      <button type="button" className="btn btn--primary" disabled={!isReady} onClick={() => id && navigate(`/films/${id}`)}>
        Start Creating
      </button>
    </div>
  );
}
