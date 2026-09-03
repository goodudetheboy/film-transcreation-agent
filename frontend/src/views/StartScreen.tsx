import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteFilm, listFilms } from '../api/filmsApiClient';
import { Button } from '../components/Button';
import type { Film } from '../api/apiClient.types';

export interface StartScreenProps {
  passcode: string;
}

/**
 * The fullscreen landing screen once logged in — a real screen, not a modal,
 * split in half like the wireframe: import a new film on the left, or pick
 * an existing one from the library on the right.
 */
export function StartScreen({ passcode }: StartScreenProps) {
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
    <div className="start-screen">
      <Link to="/films/new" className="start-screen__half start-screen__half--import">
        <span className="start-screen__icon">+</span>
        <p className="start-screen__label">Import a new film</p>
        <p className="start-screen__hint">Bring in a video and its script to start a new triage.</p>
      </Link>

      <div className="start-screen__divider" />

      <div className="start-screen__half start-screen__half--library">
        <p className="start-screen__label">Or choose from your library</p>

        {error && <p className="passcode-gate__error">{error}</p>}
        {films === null && !error && <p className="results-placeholder">Loading…</p>}
        {films !== null && films.length === 0 && (
          <p className="results-placeholder">No films yet — import one to get started.</p>
        )}
        {films !== null && films.length > 0 && (
          <ul className="content-list start-screen__library-list">
            {films.map((f) => (
              <li key={f.id} className="content-card content-card--interactive">
                <div className="content-card__top">
                  <Link
                    to={f.prep.stage === 'ready' || f.status === 'processed' ? `/films/${f.id}` : `/films/${f.id}/preparing`}
                    className="content-card__link"
                  >
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
                  <Button variant="danger" onClick={() => handleDelete(f)} disabled={deletingId === f.id}>
                    {deletingId === f.id ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
