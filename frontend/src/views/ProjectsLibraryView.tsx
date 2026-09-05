import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listProjects } from '../api/projectsApiClient';
import type { EnrichedProject } from '../api/apiClient.types';
import { ProjectCard } from '../components/ProjectCard';
import { countryCode } from '../data/countries';
import { Flag } from '../components/Flag';

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
          <Link to="/" className="btn btn--primary">
            New Project (pick a film)
          </Link>
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
            <p className="section-heading">
              <Flag code={countryCode(country)} /> {country}
            </p>
            <div className="project-card-grid">
              {group.map((p) => (
                <ProjectCard key={p.id} project={p} onOpen={() => navigate(`/films/${p.sourceFilmId}?tab=project&projectId=${p.id}`)} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
