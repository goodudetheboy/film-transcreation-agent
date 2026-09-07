import { useEffect, useState } from 'react';

/** A boolean bit of UI state persisted to localStorage — same shape as
 * useTheme.ts/useTestMode.ts, generalized since this one has multiple call
 * sites (see CHAT_PANEL_OPEN_STORAGE_KEY in useResizableChatPanel.ts, shared
 * by every docked "Agent" chat panel's open/closed toggle). */
export function usePersistedBoolean(key: string, defaultValue: boolean): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? defaultValue : raw === 'true';
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // private mode / storage disabled — state still works, just won't persist
    }
  }, [key, value]);

  return [value, setValue];
}
