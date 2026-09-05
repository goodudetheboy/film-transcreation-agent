const LAST_WORKSPACE_PATH_STORAGE_KEY = 'workspace.lastFilmPath';

/** Persists the film workspace URL (path + query, e.g. tab/projectId) so the
 * header's "Current Workspace" tab can jump straight back into it. */
export function setLastWorkspacePath(path: string): void {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_PATH_STORAGE_KEY, path);
  } catch {
    // private mode / storage disabled — the tab just won't appear next time
  }
}

export function getLastWorkspacePath(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_PATH_STORAGE_KEY);
  } catch {
    return null;
  }
}
