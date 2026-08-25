import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFilm, createProjectFromFilm } from '../api/filmsApiClient';
import type { Film } from '../api/apiClient.types';

export interface FilmDetailViewProps {
  passcode: string;
}

export function FilmDetailView({ passcode }: FilmDetailViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [film, setFilm] = useState<Film | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setFilm(null);
    setLoadError(null);
    if (!id) return;

    let cancelled = false;
    getFilm(id, passcode)
      .then((f) => {
        if (!cancelled) setFilm(f);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'failed to load film');
      });
    return () => {
      cancelled = true;
    };
  }, [id, passcode]);

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!id || country.trim() === '') return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const project = await createProjectFromFilm(id, { passcode, country });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'failed to create project');
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="passcode-gate__error">{loadError}</p>;
  if (!film) return <p className="results-placeholder">Loading…</p>;

  return (
    <div className="app-body-inner">
      <div className="view-header">
        <div>
          <p className="panel-label" style={{ marginBottom: 4 }}>
            {film.title}
          </p>
          <p className="app-tagline">
            {film.details.length} candidate detail{film.details.length === 1 ? '' : 's'} · {film.videoUrl}
          </p>
        </div>
        <span className={`status-badge status-badge--${film.status}`}>{film.status}</span>
      </div>

      <form onSubmit={handleCreateProject} className="new-project-form" style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="country">Target country</label>
          <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        {submitError && <p className="passcode-gate__error">{submitError}</p>}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={submitting || country.trim() === '' || film.details.length === 0}
        >
          {submitting ? 'Creating…' : 'Create Project'}
        </button>
      </form>

      <ul className="results-list item-list">
        {film.details.map((d) => (
          <li className="result-card" key={d.id}>
            <div className="result-card__row result-card__row--line">
              <span className="result-card__key">Line</span>
              <span className="result-card__value">{d.scriptLine || <em>(visual only)</em>}</span>
            </div>
            <div className="result-card__row">
              <span className="result-card__key">Scene</span>
              <span className="result-card__value">{d.sceneDescription}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
