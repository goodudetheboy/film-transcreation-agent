import { useEffect, useState } from 'react';

const STORAGE_KEY = 'testMode';

function readStoredTestMode(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  // No stored value (first visit) defaults to true — same "mock data, no live
  // API calls" safe default the app always started with.
  return stored === null ? true : stored === 'true';
}

export function useTestMode(): [boolean, (testMode: boolean) => void] {
  const [testMode, setTestMode] = useState<boolean>(readStoredTestMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(testMode));
  }, [testMode]);

  return [testMode, setTestMode];
}
