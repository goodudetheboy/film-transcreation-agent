import type { TimelineEntry } from '../utils/timeline';

export interface TimelineListProps {
  entries: TimelineEntry[];
}

export function TimelineList({ entries }: TimelineListProps) {
  return (
    <ul className="results-list">
      {entries.map((entry, i) => (
        <li className="result-card" key={i}>
          {entry.kind === 'dialogue' ? (
            <div className="result-card__row result-card__row--line">
              <span className="result-card__key">{entry.data.timecode}</span>
              <span className="result-card__value">
                {entry.data.character}: &ldquo;{entry.data.text}&rdquo;
              </span>
            </div>
          ) : (
            <>
              <div className="result-card__row result-card__row--line">
                <span className="result-card__key">{entry.data.timecode}</span>
                <span className="result-card__value">
                  {[entry.data.gesture, entry.data.expression].filter(Boolean).join(', ')}
                </span>
              </div>
              <div className="result-card__row">
                <span className="result-card__key">Character</span>
                <span className="result-card__value">{entry.data.character}</span>
              </div>
              <div className="result-card__row">
                <span className="result-card__key">Load</span>
                <span className="result-card__value">{entry.data.narrativeLoad}</span>
              </div>
              {entry.data.backgroundNote && (
                <div className="result-card__row">
                  <span className="result-card__key">Background</span>
                  <span className="result-card__value">{entry.data.backgroundNote}</span>
                </div>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
