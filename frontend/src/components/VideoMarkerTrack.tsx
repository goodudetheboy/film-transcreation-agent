import { timecodeToSeconds, type TimelineEntry } from '../utils/timeline';

export interface VideoMarkerTrackProps {
  duration: number;
  entries: TimelineEntry[];
}

export function VideoMarkerTrack({ duration, entries }: VideoMarkerTrackProps) {
  if (duration <= 0 || entries.length === 0) return null;

  return (
    <>
      <div className="marker-track">
        {entries.map((entry, i) => {
          const seconds = timecodeToSeconds(entry.data.timecode);
          const position = Math.min(100, Math.max(0, (seconds / duration) * 100));
          return (
            <span
              key={i}
              className={`marker-track__tick marker-track__tick--${entry.kind}`}
              style={{ left: `${position}%` }}
              title={`${entry.data.timecode} — ${entry.kind}`}
            />
          );
        })}
      </div>
      <p className="hint-text">Detected by Discover Agent — dialogue and gesture timing</p>
    </>
  );
}
