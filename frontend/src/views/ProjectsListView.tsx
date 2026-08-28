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
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title">Projects</h1>
          <p className="page-header__subtitle">Localization projects, one per target country.</p>
        </div>
        <div className="page-header__actions">
          <Link to="/projects/new" className="btn btn--primary">
            New Project
          </Link>
        </div>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}
      {projects === null && !error && <p className="results-placeholder">Loading…</p>}
      {projects !== null && projects.length === 0 && (
        <p className="results-placeholder">No projects yet — create one to get started.</p>
      )}
      {projects !== null && projects.length > 0 && (
        <ul className="content-list">
          {projects.map((p) => (
            <li key={p.id} className="content-card content-card--interactive">
              <Link to={`/projects/${p.id}`} className="content-card__link">
                <div className="content-card__body">
                  <p className="content-card__primary">{p.name}</p>
                  <p className="content-card__caption">
                    {p.items.length} detail{p.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="content-card__badges">
                  <span className={`status-badge status-badge--${p.status}`}>{p.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
