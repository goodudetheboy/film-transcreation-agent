import type { EnrichedProject } from '../api/apiClient.types';
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

/** A richer, card-styled stand-in for the old details-table row — same data
 * (country, agent/project status, item counts) but laid out like the chat
 * session library's cards instead of a spreadsheet. Used by both the
 * per-film "Projects for this film" list and the cross-film Projects Library. */
export function ProjectCard({ project, onOpen, showName = true }: ProjectCardProps) {
  const total = project.pendingCount + project.acceptedCount + project.rejectedCount + project.needResearchCount;

  return (
    <button type="button" className="project-card" onClick={onOpen}>
      <div className="project-card__top">
        <span className="project-card__country">
          <Flag code={countryCode(project.country)} className="project-card__flag" />
          <span className="project-card__country-name">{project.country}</span>
        </span>
        <span className="project-card__badges">
          {project.agentStatus ? (
            <span className={`status-badge status-badge--${project.agentStatus}`}>{project.agentStatus}</span>
          ) : (
            <span className="status-badge">no runs</span>
          )}
          <span className={`status-badge status-badge--${project.status}`}>{project.status}</span>
        </span>
      </div>

      {showName && <p className="project-card__name">{project.name}</p>}

      <div className="project-card__stats">
        <span className="project-card__stat project-card__stat--total">{total} detail{total === 1 ? '' : 's'}</span>
        <span className="project-card__stat project-card__stat--pending">{project.pendingCount} pending</span>
        <span className="project-card__stat project-card__stat--accepted">{project.acceptedCount} accepted</span>
        <span className="project-card__stat project-card__stat--rejected">{project.rejectedCount} rejected</span>
        {project.needResearchCount > 0 && (
          <span className="project-card__stat project-card__stat--research">{project.needResearchCount} need research</span>
        )}
      </div>
    </button>
  );
}
