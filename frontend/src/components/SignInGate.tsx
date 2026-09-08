import { useState, type FormEvent } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import logo from '../assets/logo.png';

const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
};

function describeAuthError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  return FRIENDLY_ERROR_MESSAGES[code] ?? 'Failed to sign in — please try again.';
}

/** The sign-in screen shown until Firebase reports a signed-in user — App.tsx
 * reacts to onAuthStateChanged itself, so this needs no onUnlock callback. */
export function SignInGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (email.trim() === '' || password === '') return;

    setChecking(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="passcode-gate">
      <div className="passcode-gate__stack">
        <img className="passcode-gate__logo" src={logo} alt="TranscreAI" />
        <form className="passcode-gate__card" onSubmit={handleSubmit}>
          <p className="passcode-gate__title">Login</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
