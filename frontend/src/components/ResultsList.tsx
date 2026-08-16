import type { FlaggedLine } from '../api/apiClient.types';
import type { StreamStatus } from '../store/resultsStore';

export interface ResultsListProps {
  lines: FlaggedLine[];
  status: StreamStatus;
}

export function ResultsList({ lines, status }: ResultsListProps) {
  if (lines.length === 0 && status !== 'streaming') {
    return <p className="results-placeholder">No flagged lines yet.</p>;
  }

  return (
    <div>
      {status === 'streaming' && <p className="results-status" role="status">Analyzing</p>}
      <ul className="results-list">
        {lines.map((line, i) => (
          <li className="result-card" key={i}>
            <div className="result-card__row result-card__row--line">
              <span className="result-card__key">Line</span>
              <span className="result-card__value">{line.line}</span>
            </div>
            <div className="result-card__row">
              <span className="result-card__key">Reason</span>
              <span className="result-card__value">{line.reason}</span>
            </div>
            <div className="result-card__row">
              <span className="result-card__key">Suggested</span>
              <span className="result-card__value">{line.suggestedReplacement}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
