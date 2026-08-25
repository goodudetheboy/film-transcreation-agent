import { useState, type FormEvent } from 'react';
import { ResultsList } from '../components/ResultsList';
import { streamAnalyze } from '../api/apiClient';
import { useResultsStore } from '../store/resultsStore';

export interface AnalyzeViewProps {
  passcode: string;
  testMode: boolean;
}

export function AnalyzeView({ passcode, testMode }: AnalyzeViewProps) {
  const [script, setScript] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const { status, lines, addFlaggedLine, setStatus, setError, reset } = useResultsStore();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (script.trim() === '' || targetCountry.trim() === '') return;

    reset();
    setStatus('streaming');

    await streamAnalyze({ script, targetCountry, passcode, testMode }, (event) => {
      if (event.type === 'line_flagged') {
        addFlaggedLine(event.line);
      } else if (event.type === 'done') {
        setStatus('done');
      } else if (event.type === 'error') {
        setError(event.message);
      }
    });
  }

  return (
    <div className="panel-grid">
      <section className="panel panel--source">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="script">Script</label>
            <textarea id="script" value={script} onChange={(e) => setScript(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="targetCountry">Target country</label>
            <input
              id="targetCountry"
              type="text"
              value={targetCountry}
              onChange={(e) => setTargetCountry(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={status === 'streaming'}>
            {status === 'streaming' ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>
      </section>
      <section className="panel panel--output">
        <p className="panel-label">Flagged Lines</p>
        <ResultsList lines={lines} status={status} />
      </section>
    </div>
  );
}
