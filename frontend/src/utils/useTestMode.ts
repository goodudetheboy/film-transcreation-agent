import { useEffect, useState } from 'react';

const STORAGE_KEY = 'testMode';

function readStoredTestMode(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  // No stored value (first visit) defaults to false — real pipeline by
  // default. See docs/adr/0029-test-mode-default-off.md for why this
  // deviates from 0010's original "mock unless explicitly disabled" default.
  return stored === null ? false : stored === 'true';
}

export function useTestMode(): [boolean, (testMode: boolean) => void] {
  const [testMode, setTestMode] = useState<boolean>(readStoredTestMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(testMode));
  }, [testMode]);

  return [testMode, setTestMode];
}
