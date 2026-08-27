import { useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { PasscodeGate } from './components/PasscodeGate';
import { TestModeBanner } from './components/TestModeBanner';
import { HeaderSettings } from './components/HeaderSettings';
import { ProjectsListView } from './views/ProjectsListView';
import { NewProjectView } from './views/NewProjectView';
import { ProjectDetailView } from './views/ProjectDetailView';
import { FilmsListView } from './views/FilmsListView';
import { NewFilmView } from './views/NewFilmView';
import { FilmDetailView } from './views/FilmDetailView';

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
      <header className="app-header">
        <div>
          <h1 className="app-title">Film Transcreation Agent</h1>
          <p className="app-tagline">Localization triage — script in, flagged lines out</p>
        </div>
        <nav className="app-nav">
          <NavLink to="/" end className={navLinkClass}>
            Films
          </NavLink>
          <NavLink to="/projects" className={navLinkClass}>
            Projects
          </NavLink>
        </nav>
        <HeaderSettings testMode={testMode} onTestModeChange={setTestMode} />
      </header>
      <main className="app-body">
        <Routes>
          <Route path="/" element={<FilmsListView passcode={passcode} />} />
          <Route path="/films/new" element={<NewFilmView passcode={passcode} testMode={testMode} />} />
          <Route
            path="/films/:id"
            element={<FilmDetailView passcode={passcode} testMode={testMode} />}
          />
          <Route path="/projects" element={<ProjectsListView passcode={passcode} />} />
          <Route path="/projects/new" element={<NewProjectView passcode={passcode} />} />
          <Route
            path="/projects/:id"
            element={<ProjectDetailView passcode={passcode} testMode={testMode} />}
          />
        </Routes>
      </main>
    </>
  );
}

export default App;
