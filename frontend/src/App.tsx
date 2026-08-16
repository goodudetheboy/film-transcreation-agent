import { useState, type FormEvent } from 'react';
import { PasscodeGate } from './components/PasscodeGate';
import { ResultsList } from './components/ResultsList';
import { ErrorBanner } from './components/ErrorBanner';
import { streamAnalyze } from './api/apiClient';
import { useResultsStore } from './store/resultsStore';

function App() {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [script, setScript] = useState('');
  const [targetCountry, setTargetCountry] = useState('');

  const { status, lines, errorMessage, addFlaggedLine, setStatus, setError, reset } =
    useResultsStore();

  function handleRetry() {
    reset();
  }

  if (passcode === null) {
    return <PasscodeGate onUnlock={setPasscode} />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (script.trim() === '' || targetCountry.trim() === '') return;

    reset();
    setStatus('streaming');

    await streamAnalyze({ script, targetCountry, passcode: passcode! }, (event) => {
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
    <>
      {status === 'error' && errorMessage && (
        <ErrorBanner message={errorMessage} onRetry={handleRetry} />
      )}
      <header className="app-header">
        <div>
          <h1 className="app-title">Cultural Resonance Agent</h1>
          <p className="app-tagline">Localization triage — script in, flagged lines out</p>
        </div>
      </header>
      <main className="app-body">
        <section className="panel panel--source">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="script">Script</label>
              <textarea
                id="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
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
      </main>
    </>
  );
}

export default App;
