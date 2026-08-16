import { useState } from 'react';

export interface HeaderSettingsProps {
  testMode: boolean;
  onTestModeChange: (value: boolean) => void;
}

export function HeaderSettings({ testMode, onTestModeChange }: HeaderSettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="header-settings">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Settings
      </button>
      {open && (
        <div className="header-settings__panel">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => onTestModeChange(e.target.checked)}
            />
            Test mode (mock data, no live API)
          </label>
        </div>
      )}
    </div>
  );
}
