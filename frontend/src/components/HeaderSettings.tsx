import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import type { Theme } from '../utils/useTheme';
import { GearIcon, SignOutIcon, UserIcon } from './icons';

export interface HeaderSettingsProps {
  email: string;
  testMode: boolean;
  onTestModeChange: (value: boolean) => void;
  theme: Theme;
  onThemeChange: (value: Theme) => void;
}

export function HeaderSettings({
  email,
  testMode,
  onTestModeChange,
  theme,
  onThemeChange,
}: HeaderSettingsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <div className="header-settings" ref={rootRef}>
      <button
        type="button"
        className={`header-settings__trigger${menuOpen ? ' header-settings__trigger--active' : ''}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <UserIcon />
        {email.split('@')[0] || email}
      </button>
      {menuOpen && (
        <div className="account-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="account-menu__item"
            onClick={() => {
              setMenuOpen(false);
              setSettingsOpen(true);
            }}
          >
            <GearIcon />
            Settings
          </button>
          <button
            type="button"
            role="menuitem"
            className="account-menu__item"
            onClick={() => {
              setMenuOpen(false);
              signOut(auth);
            }}
          >
            <SignOutIcon />
            Sign out
          </button>
        </div>
      )}
      {settingsOpen && (
        <div
          className="modal-backdrop"
          data-testid="modal-backdrop"
          onClick={() => setSettingsOpen(false)}
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
                onClick={() => setSettingsOpen(false)}
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
