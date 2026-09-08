import type { EnrichedProject, ProjectLifecycleStatus, ResearchRunStatus } from '../api/apiClient.types';
import { countryCode } from '../data/countries';
import { Flag } from './Flag';

export interface ProjectCardProps {
  project: EnrichedProject;
  onOpen: () => void;
  /** project.name is always "{country} — {film title}" (see films.ts's
   * film-first project creation) — worth showing as a byline in the cross-film
   * Projects Library, but redundant inside a single film's own workspace
   * (where the film title is already the page you're on). Defaults to shown. */
  showName?: boolean;
}

const STAGE_LABELS: Record<ProjectLifecycleStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

const AGENT_LABELS: Record<ResearchRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  error: 'Error',
};

/** A full-width row — same data (country, agent/project status, item counts)
 * as the old grid card, laid out like the Agent Status list's rows instead of
 * a square tile, so the library uses the whole available width. Used by both
 * the per-film "Projects for this film" list and the cross-film Projects
 * Library. */
export function ProjectCard({ project, onOpen, showName = true }: ProjectCardProps) {
  const total = project.pendingCount + project.acceptedCount + project.rejectedCount + project.needResearchCount;
  const reviewed = project.acceptedCount + project.rejectedCount;

  return (
    <button type="button" className="list-row" onClick={onOpen}>
      <span className="list-row__icon">
        <Flag code={countryCode(project.country)} className="project-card__flag" />
      </span>

      <div className="list-row__body">
        <div className="list-row__title-line">
          <span className="list-row__name">{project.country}</span>
        </div>
        {showName && <p className="project-card__name">{project.name}</p>}

        {total > 0 ? (
          <div className="project-card__progress">
            <div className="project-card__progress-bar" title={`${reviewed} of ${total} details reviewed`}>
              <span
                className="project-card__progress-seg project-card__progress-seg--accepted"
                style={{ width: `${(project.acceptedCount / total) * 100}%` }}
              />
              <span
                className="project-card__progress-seg project-card__progress-seg--rejected"
                style={{ width: `${(project.rejectedCount / total) * 100}%` }}
              />
              <span
                className="project-card__progress-seg project-card__progress-seg--research"
                style={{ width: `${(project.needResearchCount / total) * 100}%` }}
              />
              <span
                className="project-card__progress-seg project-card__progress-seg--pending"
                style={{ width: `${(project.pendingCount / total) * 100}%` }}
              />
            </div>
            <span className="project-card__progress-label">
              {reviewed}/{total} reviewed
            </span>
          </div>
        ) : (
          <p className="project-card__name">No details yet</p>
        )}

        <div className="project-card__stats">
          {project.pendingCount > 0 && <span className="project-card__stat project-card__stat--pending">{project.pendingCount} pending</span>}
          {project.acceptedCount > 0 && <span className="project-card__stat project-card__stat--accepted">{project.acceptedCount} accepted</span>}
          {project.rejectedCount > 0 && <span className="project-card__stat project-card__stat--rejected">{project.rejectedCount} rejected</span>}
          {project.needResearchCount > 0 && (
            <span className="project-card__stat project-card__stat--research">{project.needResearchCount} need research</span>
          )}
        </div>
      </div>

      <div className="list-row__side">
        <div className="project-card__status-group">
          <span className="project-card__status-label">Stage</span>
          <span className={`status-badge status-badge--${project.status}`}>{STAGE_LABELS[project.status]}</span>
        </div>
        <div className="project-card__status-group">
          <span className="project-card__status-label">Agent</span>
          {project.agentStatus ? (
            <span className={`status-badge status-badge--${project.agentStatus}`}>
              {project.agentStatus === 'running' && <span className="status-dot status-dot--running" />}
              {AGENT_LABELS[project.agentStatus]}
            </span>
          ) : (
            <span className="status-badge">No runs yet</span>
          )}
        </div>
      </div>
    </button>
  );
}
