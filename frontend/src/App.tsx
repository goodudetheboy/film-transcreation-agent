import { useState } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { PasscodeGate } from './components/PasscodeGate';
import { TestModeBanner } from './components/TestModeBanner';
import { HeaderSettings } from './components/HeaderSettings';
import { useTheme } from './utils/useTheme';
import { ProjectsLibraryView } from './views/ProjectsLibraryView';
import { StartScreen } from './views/StartScreen';
import { ImportFilmPage } from './views/ImportFilmPage';
import { FilmPreparingView } from './views/FilmPreparingView';
import { FilmWorkspaceView } from './views/FilmWorkspaceView';
import logo from './assets/logo.png';
import { getLastWorkspacePath } from './utils/lastWorkspace';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;
}

function App() {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(true);
  const [theme, setTheme] = useTheme();
  // Re-renders on every navigation so the "Current Workspace" tab's target
  // (read fresh from localStorage below) stays up to date as the user moves
  // between films — the value itself isn't used, only the subscription.
  useLocation();

  if (passcode === null) {
    return <PasscodeGate onUnlock={setPasscode} />;
  }

  const lastWorkspacePath = getLastWorkspacePath();

  return (
    <>
      {testMode && <TestModeBanner />}
      {/* A cosmetic app menu bar (Premiere-style chrome) — no branded header,
          no per-item dropdown behavior yet, the real actions still live in
          each panel. See docs/progress for the reasoning. */}
      <div className="menu-bar">
        <Link to="/" className="menu-bar__brand">
          <img className="menu-bar__logo" src={logo} alt="TranscreAI" />
        </Link>
        <nav className="menu-bar__nav">
          <NavLink to="/" end className={navLinkClass}>
            Films
          </NavLink>
          <NavLink to="/projects" className={navLinkClass}>
            Projects
          </NavLink>
          {lastWorkspacePath && (
            <NavLink to={lastWorkspacePath} end className={navLinkClass}>
              Current Workspace
            </NavLink>
          )}
        </nav>
        <div className="menu-bar__spacer" />
        <HeaderSettings
          testMode={testMode}
          onTestModeChange={setTestMode}
          theme={theme}
          onThemeChange={setTheme}
        />
      </div>
      <main className="app-body">
        <Routes>
          <Route path="/" element={<StartScreen passcode={passcode} />} />
          <Route path="/films/new" element={<ImportFilmPage passcode={passcode} testMode={testMode} />} />
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
