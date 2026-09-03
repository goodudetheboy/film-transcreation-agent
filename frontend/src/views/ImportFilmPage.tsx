import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFilm, uploadSubtitleFile, uploadVideoFile } from '../api/filmsApiClient';
import { Button, LinkButton } from '../components/Button';

export interface ImportFilmPageProps {
  passcode: string;
  testMode: boolean;
}

function CloudUploadIcon() {
  return (
    <svg viewBox="0 0 64 48" className="import-columns__icon" aria-hidden="true">
      <path d="M20 38a12 12 0 0 1-1-23.9A14 14 0 0 1 46 12.5 10.5 10.5 0 0 1 44.5 38H20Z" />
      <path d="M32 30V16M25 22l7-7 7 7" />
    </svg>
  );
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
    <div
      className={`drop-zone drop-zone--big${isDragging ? ' drop-zone--active' : ''}${disabled ? ' drop-zone--disabled' : ''}`}
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
        aria-label={label}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0] ?? null)}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <CloudUploadIcon />
      {file ? (
        <span className="drop-zone__filename">{file.name}</span>
      ) : (
        <span>Drag &amp; drop a file here, or click to choose one</span>
      )}
    </div>
  );
}

export function ImportFilmPage({ passcode, testMode }: ImportFilmPageProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [runDiscovery, setRunDiscovery] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const canSubmit = title.trim() !== '' && videoFile !== null && subtitleFile !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !videoFile || !subtitleFile) return;

    setSubmitting(true);
    setError(null);
    try {
      setStatus('Uploading your video…');
      setUploadProgress(testMode ? null : 0);
      const { videoUrl } = await uploadVideoFile(videoFile, { passcode, testMode }, undefined, setUploadProgress);
      setUploadProgress(null);

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
    <form className="import-page" onSubmit={handleSubmit}>
      <div className="import-page__header">
        <LinkButton to="/" variant="text" className="import-page__back">
          ← Back
        </LinkButton>
        <div className="page-header__heading import-page__heading">
          <h1 className="page-header__title import-page__title">Import new film</h1>
          <p className="page-header__subtitle import-page__subtitle">We&rsquo;ll need&hellip;</p>
        </div>
      </div>

      <div className="field import-page__title-field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="import-columns">
        <div className="import-columns__col">
          <h2 className="import-columns__heading">&hellip;the FILM itself</h2>
          <DropZone label="Video file" accept="video/*" file={videoFile} onPick={setVideoFile} disabled={submitting} />
          <p className="import-columns__caption">Supported filetype: .mp4</p>
        </div>

        <div className="import-columns__divider" />

        <div className="import-columns__col">
          <h2 className="import-columns__heading">&hellip;and the SCRIPT</h2>
          <DropZone label="Script file (.srt / .vtt)" accept=".srt,.vtt" file={subtitleFile} onPick={setSubtitleFile} disabled={submitting} />
          <p className="import-columns__caption">Supported filetypes: .srt, .vtt</p>
        </div>
      </div>

      <div className="import-page__footer">
        <div className="import-page__footer-left">
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
          {uploadProgress !== null && (
            <progress className="upload-progress" value={uploadProgress} max={1} aria-label="Video upload progress" />
          )}
          {error && <p className="passcode-gate__error">{error}</p>}
        </div>

        <Button type="submit" variant="primary" disabled={submitting || !canSubmit}>
          {submitting ? 'Preparing…' : 'Submit'}
        </Button>
      </div>
    </form>
  );
}
