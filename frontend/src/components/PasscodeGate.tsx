import { useState, type FormEvent } from 'react';

export interface PasscodeGateProps {
  onUnlock: (passcode: string) => void;
}

export function PasscodeGate({ onUnlock }: PasscodeGateProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() === '') return;
    onUnlock(value);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="passcode">Passcode</label>
      <input
        id="passcode"
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit">Unlock</button>
    </form>
  );
}
