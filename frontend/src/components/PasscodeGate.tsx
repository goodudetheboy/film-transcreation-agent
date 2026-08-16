import { useState, type FormEvent } from 'react';
import { verifyPasscode } from '../api/apiClient';

export interface PasscodeGateProps {
  onUnlock: (passcode: string) => void;
}

export function PasscodeGate({ onUnlock }: PasscodeGateProps) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() === '') return;

    setChecking(true);
    setError(null);
    const result = await verifyPasscode(value);
    setChecking(false);

    if (result.ok) {
      onUnlock(value);
    } else {
      setError(result.message ?? 'Incorrect passcode');
    }
  }

  return (
    <div className="passcode-gate">
      <form className="passcode-gate__card" onSubmit={handleSubmit}>
        <p className="passcode-gate__title">Access Required</p>
        <div className="field">
          <label htmlFor="passcode">Passcode</label>
          <input
            id="passcode"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <p role="alert" className="passcode-gate__error">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary" disabled={checking}>
          {checking ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
