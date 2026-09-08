import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import { SignInGate } from './components/SignInGate';
import { TestModeBanner } from './components/TestModeBanner';
import { HeaderSettings } from './components/HeaderSettings';
import { useTheme } from './utils/useTheme';
import { useTestMode } from './utils/useTestMode';
import { ProjectsLibraryView } from './views/ProjectsLibraryView';
import { StartScreen } from './views/StartScreen';
import { FilmPreparingView } from './views/FilmPreparingView';
import { FilmWorkspaceView } from './views/FilmWorkspaceView';
import { PrepAnimationLab } from './views/PrepAnimationLab';
import { AdminView } from './views/AdminView';
import logo from './assets/logo.png';
import { getLastWorkspacePath } from './utils/lastWorkspace';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still loading
  const [role, setRole] = useState<string | null>(null);
  const [testMode, setTestMode] = useTestMode();
  const [theme, setTheme] = useTheme();
  // Re-renders on every navigation so the "Current Workspace" tab's target
  // (read fresh from localStorage below) stays up to date as the user moves
  // between films — the value itself isn't used, only the subscription.
  useLocation();

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setRole(u ? ((await u.getIdTokenResult()).claims.role as string | undefined) ?? null : null);
    });
  }, []);

  if (user === undefined) return null;
  if (user === null) return <SignInGate />;

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
          {role === 'admin' && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="menu-bar__spacer" />
        <HeaderSettings
          email={user.email ?? ''}
          testMode={testMode}
          onTestModeChange={setTestMode}
          theme={theme}
          onThemeChange={setTheme}
        />
      </div>
      <main className="app-body">
        <Routes>
          <Route path="/" element={<StartScreen />} />
          <Route path="/films/:id/preparing" element={<FilmPreparingView testMode={testMode} />} />
          <Route
            path="/films/:id"
            element={<FilmWorkspaceView testMode={testMode} />}
          />
          <Route path="/projects" element={<ProjectsLibraryView />} />
          <Route path="/admin" element={<AdminView />} />
          {import.meta.env.DEV && <Route path="/dev/prep-animation" element={<PrepAnimationLab />} />}
        </Routes>
      </main>
    </>
  );
}

export default App;
