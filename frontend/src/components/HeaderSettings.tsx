import { useEffect, useState } from 'react';

export interface HeaderSettingsProps {
  testMode: boolean;
  onTestModeChange: (value: boolean) => void;
}

export function HeaderSettings({ testMode, onTestModeChange }: HeaderSettingsProps) {
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
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Settings
      </button>
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
              <button
                type="button"
                className="modal__close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => onTestModeChange(e.target.checked)}
              />
              Test mode (mock data, no live API)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
