import { useRef } from 'react';
import type { SubtitleEntry } from '../api/apiClient.types';

export interface VideoScrubberProps {
  entries: SubtitleEntry[];
  durationMs: number;
  currentTimeMs: number;
  onSeek: (ms: number) => void;
}

/** A draggable timeline scrubber with a labeled duration-block per subtitle
 * entry (highlighted while it's the active line) — dragging it seeks the
 * video, and clicking anywhere (including on a block) does too, since block
 * children are pointer-events:none and the click always lands on the track. */
export function VideoScrubber({ entries, durationMs, currentTimeMs, onSeek }: VideoScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  function seekFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track || durationMs <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * durationMs);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    seekFromClientX(e.clientX);
    const track = e.currentTarget;
    track.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    seekFromClientX(e.clientX);
  }

  const progressPct = durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0;

  return (
    <div
      ref={trackRef}
      className="scrubber"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      role="slider"
      aria-label="Video position"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={currentTimeMs}
    >
      <div className="scrubber__fill" style={{ width: `${progressPct}%` }} />
      {durationMs > 0 &&
        entries.map((entry) => {
          const isActive = currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs;
          const leftPct = (entry.startMs / durationMs) * 100;
          const widthPct = ((entry.endMs - entry.startMs) / durationMs) * 100;
          return (
            <div
              key={entry.id}
              className={`scrubber__block${isActive ? ' scrubber__block--active' : ''}`}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              title={entry.text}
            >
              <span className="scrubber__block-label">{entry.text}</span>
            </div>
          );
        })}
      <div className="scrubber__handle" style={{ left: `${progressPct}%` }} />
    </div>
  );
}
