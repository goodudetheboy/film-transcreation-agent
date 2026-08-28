import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFilm, uploadSubtitleFile, uploadVideoFile } from '../api/filmsApiClient';

export interface ImportFilmModalProps {
  passcode: string;
  testMode: boolean;
}

function DropZone({
  label,
  accept,
  file,
  onPick,
  disabled,
}: {
  label: string;
  accept: string;
  file: File | null;
  onPick: (file: File | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="field">
      <label>{label}</label>
      <div
        className={`drop-zone${isDragging ? ' drop-zone--active' : ''}${disabled ? ' drop-zone--disabled' : ''}`}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          onPick(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0] ?? null)}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        {file ? (
          <span className="drop-zone__filename">{file.name}</span>
        ) : (
          <span>Drag &amp; drop a file here, or click to choose one</span>
        )}
      </div>
    </div>
  );
}

export function ImportFilmModal({ passcode, testMode }: ImportFilmModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [runDiscovery, setRunDiscovery] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim() !== '' && videoFile !== null && subtitleFile !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !videoFile || !subtitleFile) return;

    setSubmitting(true);
    setError(null);
    try {
      setStatus('Uploading your video…');
      const { videoUrl } = await uploadVideoFile(videoFile, { passcode, testMode });

      setStatus('Uploading your script…');
      const { subtitleUrl, format, entries } = await uploadSubtitleFile(subtitleFile, { passcode, testMode });

      setStatus('Creating your film…');
      const film = await createFilm({
        passcode,
        title,
        videoUrl,
        subtitleUrl,
        subtitleFormat: format,
        subtitleEntries: entries,
        runDiscovery,
        testMode,
      });

      navigate(`/films/${film.id}/preparing`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to import film');
      setSubmitting(false);
      setStatus(null);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={handleSubmit} style={{ width: 440 }}>
        <div className="modal__header">
          <p className="modal__title">Import a new film</p>
          <button type="button" className="modal__close" onClick={() => navigate('/')} disabled={submitting}>
            ×
          </button>
        </div>

        <p className="page-header__subtitle" style={{ margin: 0 }}>
          We'll need the film itself and its script — a timestamped subtitle file (.srt or .vtt).
        </p>

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

        <DropZone label="The film itself" accept="video/*" file={videoFile} onPick={setVideoFile} disabled={submitting} />
        <DropZone label="And your script (.srt / .vtt)" accept=".srt,.vtt" file={subtitleFile} onPick={setSubtitleFile} disabled={submitting} />

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={runDiscovery}
            onChange={(e) => setRunDiscovery(e.target.checked)}
            disabled={submitting}
          />
          Run Discovery agent to detect details?
        </label>

        {status && (
          <p className="results-status" role="status">
            {status}
          </p>
        )}
        {error && <p className="passcode-gate__error">{error}</p>}

        <button type="submit" className="btn btn--primary" disabled={submitting || !canSubmit}>
          {submitting ? 'Preparing…' : 'Start Creating'}
        </button>
      </form>
    </div>
  );
}
