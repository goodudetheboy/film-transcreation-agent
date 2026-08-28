import type { TimelineEntry } from '../utils/timeline';

export interface TimelineListProps {
  entries: TimelineEntry[];
}

export function TimelineList({ entries }: TimelineListProps) {
  return (
    <ul className="content-list">
      {entries.map((entry, i) => (
        <li className="content-card" key={i}>
          <p className="content-card__caption">{entry.data.timecode}</p>
          {entry.kind === 'dialogue' ? (
            <p className="content-card__primary">
              {entry.data.character}: &ldquo;{entry.data.text}&rdquo;
            </p>
          ) : (
            <>
              <p className="content-card__primary">
                {entry.data.character} — {[entry.data.gesture, entry.data.expression].filter(Boolean).join(', ')}
              </p>
              <p className="content-card__secondary">Narrative load: {entry.data.narrativeLoad}</p>
              {entry.data.backgroundNote && (
                <p className="content-card__secondary">{entry.data.backgroundNote}</p>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
