import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listProjects } from '../api/projectsApiClient';
import { LinkButton } from '../components/Button';
import type { EnrichedProject } from '../api/apiClient.types';

export interface ProjectsLibraryViewProps {
  passcode: string;
}

/** Groups the flat project list by target country, matching the wireframe's
 * "Project Library grouped by country" layout. */
function groupByCountry(projects: EnrichedProject[]): Array<[string, EnrichedProject[]]> {
  const groups = new Map<string, EnrichedProject[]>();
  for (const p of projects) {
    const list = groups.get(p.country) ?? [];
    list.push(p);
    groups.set(p.country, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function ProjectsLibraryView({ passcode }: ProjectsLibraryViewProps) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<EnrichedProject[] | null>(null);
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
          <p className="page-header__subtitle">Localization projects, grouped by target country.</p>
        </div>
        <div className="page-header__actions">
          <LinkButton to="/" variant="primary">
            New Project (pick a film)
          </LinkButton>
        </div>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}
      {projects === null && !error && <p className="results-placeholder">Loading…</p>}
      {projects !== null && projects.length === 0 && (
        <p className="results-placeholder">No projects yet — import a film, then create a project from it.</p>
      )}

      {projects !== null &&
        groupByCountry(projects).map(([country, group]) => (
          <div key={country}>
            <p className="section-heading">{country}</p>
            <div className="details-table-wrap details-table-wrap--standalone">
              <div className="details-table-scroll">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Agent Status</th>
                      <th>Project Status</th>
                      <th>Pending</th>
                      <th>Accepted</th>
                      <th>Rejected</th>
                      <th>Need research</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((p) => (
                      <tr
                        key={p.id}
                        className="details-table__row--clickable"
                        onClick={() => navigate(`/films/${p.sourceFilmId}?tab=project&projectId=${p.id}`)}
                      >
                        <td>
                          <Link
                            to={`/films/${p.sourceFilmId}?tab=project&projectId=${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td>
                          {p.agentStatus ? (
                            <span className={`status-badge status-badge--${p.agentStatus}`}>{p.agentStatus}</span>
                          ) : (
                            <span className="results-placeholder">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge status-badge--${p.status}`}>{p.status}</span>
                        </td>
                        <td>{p.pendingCount}</td>
                        <td>{p.acceptedCount}</td>
                        <td>{p.rejectedCount}</td>
                        <td>{p.needResearchCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
