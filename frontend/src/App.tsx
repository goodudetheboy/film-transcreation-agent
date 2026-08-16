import { useState, type FormEvent } from 'react';
import { PasscodeGate } from './components/PasscodeGate';
import { ResultsList } from './components/ResultsList';
import { streamAnalyze } from './api/apiClient';
import { useResultsStore } from './store/resultsStore';

function App() {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [script, setScript] = useState('');
  const [targetCountry, setTargetCountry] = useState('');

  const { status, lines, errorMessage, addFlaggedLine, setStatus, setError, reset } =
    useResultsStore();

  if (passcode === null) {
    return <PasscodeGate onUnlock={setPasscode} />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (script.trim() === '' || targetCountry.trim() === '') return;

    reset();
    setStatus('streaming');

    await streamAnalyze({ script, targetCountry, passcode: passcode!, }, (event) => {
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
    <main>
      <h1>Cultural Resonance Agent</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="script">Script</label>
        <textarea id="script" value={script} onChange={(e) => setScript(e.target.value)} />
        <label htmlFor="targetCountry">Target country</label>
        <input
          id="targetCountry"
          value={targetCountry}
          onChange={(e) => setTargetCountry(e.target.value)}
        />
        <button type="submit" disabled={status === 'streaming'}>
          Analyze
        </button>
      </form>
      {status === 'error' && errorMessage && <p role="alert">{errorMessage}</p>}
      <ResultsList lines={lines} status={status} />
    </main>
  );
}

export default App;
