import { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { PasscodeGate } from './components/PasscodeGate';
import { TestModeBanner } from './components/TestModeBanner';
import { HeaderSettings } from './components/HeaderSettings';
import { ProjectsLibraryView } from './views/ProjectsLibraryView';
import { NewProjectWizardView } from './views/NewProjectWizardView';
import { ProjectWorkspaceView } from './views/ProjectWorkspaceView';
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
        <span className="menu-bar__brand">● Film Transcreation Agent</span>
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
          <Route
            path="/films/:filmId/projects/new"
            element={<NewProjectWizardView passcode={passcode} testMode={testMode} />}
          />
          <Route path="/projects" element={<ProjectsLibraryView passcode={passcode} />} />
          <Route
            path="/projects/:id"
            element={<ProjectWorkspaceView passcode={passcode} testMode={testMode} />}
          />
        </Routes>
      </main>
    </>
  );
}

export default App;
