import type { DiscoveryJobSummary } from '../api/apiClient.types';

export interface AgentRunningListProps {
  jobs: DiscoveryJobSummary[];
  activeJobId: string | null;
  onSelect: (jobId: string) => void;
}

export function AgentRunningList({ jobs, activeJobId, onSelect }: AgentRunningListProps) {
  if (jobs.length === 0) {
    return <p className="results-placeholder">No agent passes yet — kick one off above.</p>;
  }

  return (
    <ul className="content-list">
      {jobs.map((job) => (
        <li key={job.id}>
          <button
            type="button"
            className={`content-card content-card--interactive agent-running-item${job.id === activeJobId ? ' agent-running-item--active' : ''}`}
            onClick={() => onSelect(job.id)}
          >
            <div className="content-card__top">
              <div className="content-card__body">
                <p className="content-card__primary">
                  Agent #{job.agentNumber} · Pass #{job.passNumber}
                  {job.name ? ` — ${job.name}` : ''}
                </p>
                <p className="content-card__secondary">{job.specialInstruction || <em>No special instruction</em>}</p>
              </div>
              <div className="content-card__badges">
                <span className={`status-badge status-badge--${job.status}`}>{job.status}</span>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
