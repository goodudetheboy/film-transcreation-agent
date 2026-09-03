import { formatClock } from '../utils/timeFormat';
import { Button } from './Button';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, SpeakerHighIcon, SpeakerLowIcon, SpeakerMuteIcon } from './icons';

export interface TransportBarProps {
  playing: boolean;
  zoom: number;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  onTogglePlay: () => void;
  onSeekRelative: (deltaSeconds: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <SpeakerMuteIcon />;
  if (volume < 0.5) return <SpeakerLowIcon />;
  return <SpeakerHighIcon />;
}

/** The horizontal transport row under the video frame — playback controls,
 * volume, and a time readout on the left, picture-zoom controls on the right.
 * Mirrors a real NLE's Program Monitor control bar rather than a vertical
 * icon strip. */
export function TransportBar({
  playing,
  zoom,
  currentTimeMs,
  durationMs,
  volume,
  muted,
  onTogglePlay,
  onSeekRelative,
  onZoomIn,
  onZoomOut,
  onVolumeChange,
  onToggleMute,
}: TransportBarProps) {
  return (
    <div className="transport-bar">
      <div className="transport-bar__group">
        <Button variant="icon" size="lg" title="Back 5s" onClick={() => onSeekRelative(-5)}>
          <SkipBackIcon />
        </Button>
        <Button variant="icon" size="lg" tone="primary" title={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button variant="icon" size="lg" title="Forward 5s" onClick={() => onSeekRelative(5)}>
          <SkipForwardIcon />
        </Button>
      </div>

      <div className="transport-bar__group transport-bar__volume">
        <Button variant="icon" size="lg" title={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          <VolumeIcon volume={volume} muted={muted} />
        </Button>
        <input
          type="range"
          className="transport-bar__volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          title="Volume"
          aria-label="Volume"
          style={{
            background: `linear-gradient(to right, var(--accent) ${(muted ? 0 : volume) * 100}%, var(--border-strong) ${(muted ? 0 : volume) * 100}%)`,
          }}
        />
      </div>

      <span className="transport-bar__time">
        {formatClock(currentTimeMs)} / {formatClock(durationMs)}
      </span>

      <div className="transport-bar__spacer" />

      <div className="transport-bar__group">
        <Button variant="icon" size="lg" title="Zoom out" onClick={onZoomOut} disabled={zoom <= 1}>
          −
        </Button>
        <span className="transport-bar__zoom">{Math.round(zoom * 100)}%</span>
        <Button variant="icon" size="lg" title="Zoom in" onClick={onZoomIn} disabled={zoom >= 2}>
          ＋
        </Button>
      </div>
    </div>
  );
}
