import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFilm } from '../api/filmsApiClient';

export interface NewFilmViewProps {
  passcode: string;
}

export function NewFilmView({ passcode }: NewFilmViewProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim() !== '' && script.trim() !== '' && videoUrl.trim() !== '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const film = await createFilm({ passcode, title, script, videoUrl });
      navigate(`/films/${film.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create film');
      setSubmitting(false);
    }
  }

  return (
    <div className="app-body-inner">
      <p className="panel-label">New Film</p>
      <p className="app-tagline" style={{ marginTop: -8 }}>
        Discovery is mocked for now — every film gets the same sample candidate details,
        regardless of what's submitted below.
      </p>
      <form onSubmit={handleSubmit} className="new-project-form">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="videoUrl">Video URL (mocked, not fetched)</label>
          <input
            id="videoUrl"
            type="text"
            placeholder="https://example.com/video.mp4"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
        </div>

        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="script">Script</label>
          <textarea id="script" value={script} onChange={(e) => setScript(e.target.value)} />
        </div>

        {error && <p className="passcode-gate__error">{error}</p>}

        <button type="submit" className="btn btn--primary" disabled={submitting || !canSubmit}>
          {submitting ? 'Processing…' : 'Add Film'}
        </button>
      </form>
    </div>
  );
}
