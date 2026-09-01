import { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { PasscodeGate } from './components/PasscodeGate';
import { TestModeBanner } from './components/TestModeBanner';
import { HeaderSettings } from './components/HeaderSettings';
import { ProjectsLibraryView } from './views/ProjectsLibraryView';
import { StartScreen } from './views/StartScreen';
import { ImportFilmModal } from './views/ImportFilmModal';
import { FilmPreparingView } from './views/FilmPreparingView';
import { FilmWorkspaceView } from './views/FilmWorkspaceView';

const MENU_LABELS = ['File', 'Edit', 'View', 'Window', 'Help'];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;
}

function App() {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(true);

  if (passcode === null) {
    return <PasscodeGate onUnlock={setPasscode} />;
  }

  return (
    <>
      {testMode && <TestModeBanner />}
      {/* A cosmetic app menu bar (Premiere-style chrome) — no branded header,
          no per-item dropdown behavior yet, the real actions still live in
          each panel. See docs/progress for the reasoning. */}
      <div className="menu-bar">
        <span className="menu-bar__brand">
          <svg className="menu-bar__brand-mark" aria-hidden="true" viewBox="0 0 34 34" fill="none">
            <rect width="34" height="34" rx="9" fill="var(--accent)" />
            <path d="M9 13.5h16l-1.4-3.4a1.5 1.5 0 0 0-1.4-.9H11.8a1.5 1.5 0 0 0-1.4.9L9 13.5Z" fill="#8b5cf6" />
            <rect x="9" y="13.5" width="16" height="11" rx="1.5" fill="#f0f1f5" />
            <path d="M15.5 16.8v5l4.3-2.5-4.3-2.5Z" fill="var(--accent)" />
          </svg>
          <span className="menu-bar__brand-word">
            Film <span className="menu-bar__brand-word--accent">Transcreation</span> Agent
          </span>
        </span>
        <nav className="menu-bar__menus">
          {MENU_LABELS.map((label) => (
            <span key={label} className="menu-bar__menu">
              {label}
            </span>
          ))}
        </nav>
        <nav className="menu-bar__nav">
          <NavLink to="/" end className={navLinkClass}>
            Films
          </NavLink>
          <NavLink to="/projects" className={navLinkClass}>
            Projects
          </NavLink>
        </nav>
        <HeaderSettings testMode={testMode} onTestModeChange={setTestMode} />
      </div>
      <main className="app-body">
        <Routes>
          <Route path="/" element={<StartScreen passcode={passcode} />} />
          <Route path="/films/new" element={<ImportFilmModal passcode={passcode} testMode={testMode} />} />
          <Route path="/films/:id/preparing" element={<FilmPreparingView passcode={passcode} />} />
          <Route
            path="/films/:id"
            element={<FilmWorkspaceView passcode={passcode} testMode={testMode} />}
          />
          <Route path="/projects" element={<ProjectsLibraryView passcode={passcode} />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
