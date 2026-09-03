import { useEffect, useState } from 'react';
import { Button } from './Button';
import type { Theme } from '../utils/useTheme';

export interface HeaderSettingsProps {
  testMode: boolean;
  onTestModeChange: (value: boolean) => void;
  theme: Theme;
  onThemeChange: (value: Theme) => void;
}

export function HeaderSettings({
  testMode,
  onTestModeChange,
  theme,
  onThemeChange,
}: HeaderSettingsProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div className="header-settings">
      <Button aria-expanded={open} onClick={() => setOpen(true)}>
        Settings
      </Button>
      {open && (
        <div
          className="modal-backdrop"
          data-testid="modal-backdrop"
          onClick={() => setOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <p className="modal__title">Settings</p>
              <Button variant="icon" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </Button>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => onTestModeChange(e.target.checked)}
              />
              Test mode (mock data, no live API)
            </label>
            <div className="field">
              <label htmlFor="theme-select">Theme</label>
              <select
                id="theme-select"
                value={theme}
                onChange={(e) => onThemeChange(e.target.value as Theme)}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
