import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFilms } from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

export interface FilmsListViewProps {
  passcode: string;
}

export function FilmsListView({ passcode }: FilmsListViewProps) {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFilms(passcode)
      .then((f) => {
        if (!cancelled) setFilms(f);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load films');
      });
    return () => {
      cancelled = true;
    };
  }, [passcode]);

  return (
    <div className="app-body-inner">
      <div className="view-header">
        <p className="panel-label">Films</p>
        <Link to="/films/new" className="btn btn--primary">
          New Film
        </Link>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}
      {films === null && !error && <p className="results-placeholder">Loading…</p>}
      {films !== null && films.length === 0 && (
        <p className="results-placeholder">No films yet — add one to get started.</p>
      )}
      {films !== null && films.length > 0 && (
        <ul className="project-list">
          {films.map((f) => (
            <li key={f.id} className="project-card">
              <Link to={`/films/${f.id}`} className="project-card__link">
                <span className="project-card__country">{f.title}</span>
                <span className="project-card__meta">
                  {f.details.length} detail{f.details.length === 1 ? '' : 's'}
                </span>
                <span className={`status-badge status-badge--${f.status}`}>{f.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
