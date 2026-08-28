export interface VideoControlsProps {
  playing: boolean;
  onTogglePlay: () => void;
  onSeekRelative: (deltaSeconds: number) => void;
  onBack: () => void;
}

export function VideoControls({ playing, onTogglePlay, onSeekRelative, onBack }: VideoControlsProps) {
  return (
    <div className="video-controls">
      <button type="button" className="btn" onClick={onBack} title="Back to workspace">
        ←
      </button>
      <button type="button" className="btn" onClick={() => onSeekRelative(-5)} title="Back 5s">
        «
      </button>
      <button type="button" className="btn btn--primary" onClick={onTogglePlay}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className="btn" onClick={() => onSeekRelative(5)} title="Forward 5s">
        »
      </button>
    </div>
  );
}
