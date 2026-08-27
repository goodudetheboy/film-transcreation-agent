import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjects } from '../api/projectsApiClient';
import type { Project } from '../api/apiClient.types';

export interface ProjectsListViewProps {
  passcode: string;
}

export function ProjectsListView({ passcode }: ProjectsListViewProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects(passcode)
      .then((p) => {
        if (!cancelled) setProjects(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load projects');
      });
    return () => {
      cancelled = true;
    };
  }, [passcode]);

  return (
    <div className="app-body-inner">
      <div className="view-header">
        <p className="panel-label">Projects</p>
        <Link to="/projects/new" className="btn btn--primary">
          New Project
        </Link>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}
      {projects === null && !error && <p className="results-placeholder">Loading…</p>}
      {projects !== null && projects.length === 0 && (
        <p className="results-placeholder">No projects yet — create one to get started.</p>
      )}
      {projects !== null && projects.length > 0 && (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} className="project-card">
              <Link to={`/projects/${p.id}`} className="project-card__link">
                <span className="project-card__country">{p.name}</span>
                <span className="project-card__meta">
                  {p.items.length} detail{p.items.length === 1 ? '' : 's'}
                </span>
                <span className={`status-badge status-badge--${p.status}`}>{p.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
