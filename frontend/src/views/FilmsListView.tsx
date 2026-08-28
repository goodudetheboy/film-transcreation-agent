import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteFilm, listFilms } from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

export interface FilmsListViewProps {
  passcode: string;
}

export function FilmsListView({ passcode }: FilmsListViewProps) {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(film: Film) {
    if (!window.confirm(`Delete "${film.title}"? This cannot be undone.`)) return;

    setDeletingId(film.id);
    try {
      await deleteFilm(film.id, passcode);
      setFilms((prev) => prev?.filter((f) => f.id !== film.id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete film');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="app-body-inner">
      <div className="page-header">
        <div className="page-header__heading">
          <h1 className="page-header__title">Films</h1>
          <p className="page-header__subtitle">Films submitted for localization triage.</p>
        </div>
        <div className="page-header__actions">
          <Link to="/films/new" className="btn btn--primary">
            New Film
          </Link>
        </div>
      </div>

      {error && <p className="passcode-gate__error">{error}</p>}
      {films === null && !error && <p className="results-placeholder">Loading…</p>}
      {films !== null && films.length === 0 && (
        <p className="results-placeholder">No films yet — add one to get started.</p>
      )}
      {films !== null && films.length > 0 && (
        <ul className="content-list">
          {films.map((f) => (
            <li key={f.id} className="content-card content-card--interactive">
              <div className="content-card__top">
                <Link to={f.prep.stage === 'ready' || f.status === 'processed' ? `/films/${f.id}` : `/films/${f.id}/preparing`} className="content-card__link">
                  <div className="content-card__body">
                    <p className="content-card__primary">{f.title}</p>
                    <p className="content-card__caption">
                      {f.subtitle ? `${f.subtitle.entries.length} subtitle line${f.subtitle.entries.length === 1 ? '' : 's'}` : 'No subtitle'}
                    </p>
                  </div>
                  <div className="content-card__badges">
                    <span className={`status-badge status-badge--${f.status === 'processed' ? 'done' : 'running'}`}>{f.status}</span>
                  </div>
                </Link>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleDelete(f)}
                  disabled={deletingId === f.id}
                >
                  {deletingId === f.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
