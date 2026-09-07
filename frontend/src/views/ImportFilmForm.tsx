import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';

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
}: {
  label: string;
  accept: string;
  file: File | null;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={`drop-zone drop-zone--big${isDragging ? ' drop-zone--active' : ''}`}
      onDragOver={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        onPick(e.dataTransfer.files?.[0] ?? null);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={label}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0] ?? null)}
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

export interface ImportFilmFormProps {
  title: string;
  onTitleChange: (title: string) => void;
  videoFile: File | null;
  onVideoFile: (file: File | null) => void;
  subtitleFile: File | null;
  onSubtitleFile: (file: File | null) => void;
  runDiscovery: boolean;
  onRunDiscoveryChange: (run: boolean) => void;
  canSubmit: boolean;
  error: string | null;
  onSubmit: () => void;
}

/**
 * The file-picking step of importing a film — title, video/script drop
 * zones, and the discovery-agent checkbox. Purely presentational: once
 * submitted, the parent `FilmPreparingView` takes over and drives the
 * upload/prep animation sequence itself, on the same screen, rather than
 * this component navigating anywhere — see docs/progress/20260906.md for
 * why the upload animations moved out of here.
 */
export function ImportFilmForm({
  title,
  onTitleChange,
  videoFile,
  onVideoFile,
  subtitleFile,
  onSubtitleFile,
  runDiscovery,
  onRunDiscoveryChange,
  canSubmit,
  error,
  onSubmit,
}: ImportFilmFormProps) {
  return (
    <form
      className="import-page"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="import-page__header">
        <Link to="/" className="btn import-page__back">
          ← Back
        </Link>
        <div className="page-header__heading import-page__heading">
          <h1 className="page-header__title import-page__title">Import new film</h1>
          <p className="page-header__subtitle import-page__subtitle">We&rsquo;ll need&hellip;</p>
        </div>
      </div>

      <div className="field import-page__title-field">
        <label htmlFor="title">Title</label>
        <input id="title" type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} />
      </div>

      <div className="import-columns">
        <div className="import-columns__col">
          <h2 className="import-columns__heading">&hellip;the FILM itself</h2>
          <DropZone label="Video file" accept="video/*" file={videoFile} onPick={onVideoFile} />
          <p className="import-columns__caption">Supported filetype: .mp4</p>
        </div>

        <div className="import-columns__divider" />

        <div className="import-columns__col">
          <h2 className="import-columns__heading">&hellip;and the SCRIPT</h2>
          <DropZone label="Script file (.srt / .vtt)" accept=".srt,.vtt" file={subtitleFile} onPick={onSubtitleFile} />
          <p className="import-columns__caption">Supported filetypes: .srt, .vtt</p>
        </div>
      </div>

      <div className="import-page__footer">
        <div className="import-page__footer-left">
          <label className="checkbox-field">
            <input type="checkbox" checked={runDiscovery} onChange={(e) => onRunDiscoveryChange(e.target.checked)} />
            Run Discovery agent to detect details?
          </label>
          <p className="results-placeholder">
            {runDiscovery
              ? "Finds candidate rows for you to review and merge — nothing is added to the table without your say-so."
              : "No rows to start — you'll add details by hand from the film's Details tab."}
          </p>

          {error && <p className="passcode-gate__error">{error}</p>}
        </div>

        <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
          Submit
        </button>
      </div>
    </form>
  );
}
