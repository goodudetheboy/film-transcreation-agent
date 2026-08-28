import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFilm, uploadVideoFile } from '../api/filmsApiClient';

export interface NewFilmViewProps {
  passcode: string;
  testMode: boolean;
}

export function NewFilmView({ passcode, testMode }: NewFilmViewProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim() !== '' && (file !== null || videoUrl.trim() !== '');
  const willUploadForReal = !testMode && (file !== null || (videoUrl.trim() !== '' && !videoUrl.startsWith('gs://')));

  function selectFile(picked: File | null) {
    setFile(picked);
    if (picked) setVideoUrl('');
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (submitting) return;
    selectFile(e.dataTransfer.files?.[0] ?? null);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    selectFile(e.target.files?.[0] ?? null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      let finalVideoUrl = videoUrl;
      if (file) {
        const uploaded = await uploadVideoFile(file, { passcode, testMode });
        finalVideoUrl = uploaded.videoUrl;
      }
      const film = await createFilm({ passcode, title, script: '', videoUrl: finalVideoUrl, testMode });
      navigate(`/films/${film.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create film');
      setSubmitting(false);
    }
  }

  return (
    <div className="app-body-inner app-body-inner--centered">
      <div className="page-header__heading">
        <h1 className="page-header__title">New Film</h1>
        <p className="page-header__subtitle">
          Discovery is mocked for now — every film gets the same sample candidate details,
          regardless of what's submitted below.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="new-project-form">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label htmlFor="videoUrl">Video URL (gs:// or https://)</label>
          <input
            id="videoUrl"
            type="text"
            placeholder="gs://bucket/clip.mp4 or https://example.com/video.mp4"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setFile(null);
            }}
            disabled={submitting}
          />
        </div>

        <div className="field">
          <label>Or drop a local video file</label>
          <div
            className={`drop-zone${isDragging ? ' drop-zone--active' : ''}${submitting ? ' drop-zone--disabled' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!submitting) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !submitting && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              data-testid="video-file-input"
              onChange={handleFileInputChange}
              disabled={submitting}
              style={{ display: 'none' }}
            />
            {file ? (
              <span className="drop-zone__filename">{file.name}</span>
            ) : (
              <span>Drag & drop a video file here, or click to choose one</span>
            )}
          </div>
        </div>

        {submitting && (
          <p className="results-status" role="status">
            {willUploadForReal ? 'Uploading video to bucket…' : 'Processing…'}
          </p>
        )}
        {error && <p className="passcode-gate__error">{error}</p>}

        <button type="submit" className="btn btn--primary" disabled={submitting || !canSubmit}>
          {submitting ? 'Processing…' : 'Add Film'}
        </button>
      </form>
    </div>
  );
}
