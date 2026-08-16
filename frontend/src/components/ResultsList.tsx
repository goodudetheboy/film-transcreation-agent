import type { FlaggedLine } from '../api/apiClient.types';
import type { StreamStatus } from '../store/resultsStore';

export interface ResultsListProps {
  lines: FlaggedLine[];
  status: StreamStatus;
}

export function ResultsList({ lines, status }: ResultsListProps) {
  if (lines.length === 0 && status !== 'streaming') {
    return <p>No flagged lines yet.</p>;
  }

  return (
    <div>
      {status === 'streaming' && <p role="status">Analyzing…</p>}
      <ul>
        {lines.map((line, i) => (
          <li key={i}>
            <p>{line.line}</p>
            <p>{line.reason}</p>
            <p>{line.suggestedReplacement}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
