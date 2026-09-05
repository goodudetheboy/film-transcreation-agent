import { useEffect, useState, type FormEvent } from 'react';
import { verifyPasscode } from '../api/apiClient';
import logo from '../assets/logo.png';

export const PASSCODE_STORAGE_KEY = 'film-transcreation-agent:passcode';

export interface PasscodeGateProps {
  onUnlock: (passcode: string) => void;
}

export function PasscodeGate({ onUnlock }: PasscodeGateProps) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(PASSCODE_STORAGE_KEY);
    if (!saved) return;

    let cancelled = false;
    setChecking(true);
    verifyPasscode(saved).then((result) => {
      if (cancelled) return;
      setChecking(false);
      if (result.ok) {
        onUnlock(saved);
      } else {
        localStorage.removeItem(PASSCODE_STORAGE_KEY);
      }
    });

    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() === '') return;

    setChecking(true);
    setError(null);
    const result = await verifyPasscode(value);
    setChecking(false);

    if (result.ok) {
      localStorage.setItem(PASSCODE_STORAGE_KEY, value);
      onUnlock(value);
    } else {
      setError(result.message ?? 'Incorrect passcode');
    }
  }

  return (
    <div className="passcode-gate">
      <div className="passcode-gate__stack">
        <img className="passcode-gate__logo" src={logo} alt="TranscreAI" />
        <form className="passcode-gate__card" onSubmit={handleSubmit}>
          <p className="passcode-gate__title">Login</p>
          <div className="field">
            <label htmlFor="user">User</label>
            <input id="user" type="text" value="Shared workspace" disabled />
          </div>
          <div className="field">
            <label htmlFor="passcode">Password</label>
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
            {checking ? 'Checking…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}
