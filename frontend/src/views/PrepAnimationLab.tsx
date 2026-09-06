import { useState } from 'react';
import { PrepAnimation } from '../components/PrepAnimation';
import { STAGE_LABELS, type DisplayPrepStage } from '../utils/useStageDwell';

const ALL_STAGES: DisplayPrepStage[] = [
  'preparing',
  'video_uploading',
  'subtitle_uploading',
  'discovery_running',
  'finalizing',
  'ready',
  'error',
];

/** Dev-only playground for iterating on the PrepAnimation scenes without
 * driving a real upload/prep run. Not linked from the app nav — reach it
 * directly at /dev/prep-animation, and only registered when running the
 * Vite dev server (see the `import.meta.env.DEV` gate in App.tsx). */
export function PrepAnimationLab() {
  const [stage, setStage] = useState<DisplayPrepStage>('preparing');
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="app-body-inner app-body-inner--centered">
      <div className="page-header__heading">
        <h1 className="page-header__title">Prep Animation Lab</h1>
        <p className="page-header__subtitle">Dev-only preview of every PrepAnimation stage.</p>
      </div>

      <div className="prep-lab__stage-picker">
        {ALL_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn${s === stage ? ' btn--primary' : ''}`}
            onClick={() => {
              setStage(s);
              setReplayKey((k) => k + 1);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <PrepAnimation key={`${stage}-${replayKey}`} stage={stage} />
      <p className="prep-stage-label">{STAGE_LABELS[stage]}</p>

      <button type="button" className="btn" onClick={() => setReplayKey((k) => k + 1)}>
        Replay
      </button>
    </div>
  );
}
