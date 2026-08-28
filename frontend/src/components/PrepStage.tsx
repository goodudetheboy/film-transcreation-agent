export type PrepStageState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

export interface PrepStageProps {
  label: string;
  state: PrepStageState;
}

export function PrepStage({ label, state }: PrepStageProps) {
  return (
    <div className={`prep-stage prep-stage--${state}`}>
      <span className="prep-stage__icon" aria-hidden="true">
        {state === 'done' && '✓'}
        {state === 'error' && '!'}
        {state === 'active' && <span className="prep-stage__spinner" />}
        {(state === 'pending' || state === 'skipped') && '•'}
      </span>
      <span className="prep-stage__label">{label}</span>
    </div>
  );
}
