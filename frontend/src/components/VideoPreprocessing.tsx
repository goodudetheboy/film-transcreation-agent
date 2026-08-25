import { useState, type FormEvent } from 'react';
import { preprocessVideo } from '../api/apiClient';
import type { GestureLog } from '../api/apiClient.types';

export interface VideoPreprocessingProps {
  passcode: string;
  testMode: boolean;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function VideoPreprocessing({ passcode, testMode }: VideoPreprocessingProps) {
  const [videoUrl, setVideoUrl] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [lines, setLines] = useState<GestureLog[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (videoUrl.trim() === '') return;

    setStatus('loading');
    setErrorMessage(null);

    const result = await preprocessVideo({ videoUrl, passcode, testMode });
    if (result.ok) {
      setLines(result.lines);
      setStatus('done');
    } else {
      setErrorMessage(result.message);
      setStatus('error');
    }
  }

  function handleDoResearch() {
    // Stub — not wired to the analysis flow yet.
  }

  return (
    <div className="panel-grid">
      <section className="panel panel--source">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div className="field">
            <label htmlFor="videoUrl">Video</label>
            <input
              id="videoUrl"
              type="text"
              placeholder="url, mp4, ..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="videoScript">Script</label>
            <textarea id="videoScript" placeholder="txt (coming soon)" disabled />
          </div>
          <button type="submit" className="btn btn--primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Processing…' : 'Submit for preprocessing'}
          </button>
        </form>
      </section>
      <section className="panel panel--output">
        <p className="panel-label">Preprocessing Output</p>
        {status === 'loading' && (
          <p className="results-status" role="status">
            Processing (using Discovery agent)
          </p>
        )}
        {status === 'error' && errorMessage && (
          <p className="passcode-gate__error" role="alert">
            {errorMessage}
          </p>
        )}
        {status !== 'loading' && lines.length === 0 && (
          <p className="results-placeholder">No gestures logged yet.</p>
        )}
        {lines.length > 0 && (
          <ul className="results-list">
            {lines.map((gestureLog, i) => (
              <li className="result-card" key={i}>
                <div className="result-card__row result-card__row--line">
                  <span className="result-card__key">{gestureLog.timecode}</span>
                  <span className="result-card__value">{gestureLog.gesture}</span>
                </div>
                <div className="result-card__row">
                  <span className="result-card__key">Character</span>
                  <span className="result-card__value">{gestureLog.character}</span>
                </div>
                <div className="result-card__row">
                  <span className="result-card__key">Load</span>
                  <span className="result-card__value">{gestureLog.narrativeLoad}</span>
                </div>
                {gestureLog.backgroundNote && (
                  <div className="result-card__row">
                    <span className="result-card__key">Background</span>
                    <span className="result-card__value">{gestureLog.backgroundNote}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="field">
          <label htmlFor="videoTargetCountry">Country</label>
          <input
            id="videoTargetCountry"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <button type="button" className="btn" onClick={handleDoResearch}>
          Do research
        </button>
      </section>
    </div>
  );
}
