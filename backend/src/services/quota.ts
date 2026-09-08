import type { Account } from './accountTypes.js';
import type { DiscoveryJobStore } from './discoveryJobStore.js';
import type { FilmStore } from './filmStore.js';
import type { ProjectStore } from './projectStore.js';
import type { ResearchRunStore } from './researchRunStore.js';

/** Same `{ok:false,error}` shape as discoveryResultActions.ts's Result type —
 * callers do `if (!result.ok) { res.status(403).json({error: result.error}); return; }`. */
export type QuotaCheck = { ok: true } | { ok: false; error: string };

const NON_TERMINAL_JOB_STATUSES = new Set(['queued', 'running']);
const NON_TERMINAL_RUN_STATUSES = new Set(['queued', 'running']);

/** Admins provisioned nothing to be capped against — see docs/adr/0028: the
 * admin account owns the pre-existing shared workspace, unbounded. */
function isExempt(account: Account): boolean {
  return account.role === 'admin';
}

export async function assertWithinFilmQuota(deps: { filmStore: FilmStore }, account: Account): Promise<QuotaCheck> {
  if (isExempt(account)) return { ok: true };
  const owned = (await deps.filmStore.listFilms()).filter((f) => f.ownerUid === account.uid);
  if (owned.length >= account.quotas.maxFilms) {
    return { ok: false, error: `film quota reached (${account.quotas.maxFilms} max)` };
  }
  return { ok: true };
}

export async function assertWithinProjectQuota(deps: { projectStore: ProjectStore }, account: Account): Promise<QuotaCheck> {
  if (isExempt(account)) return { ok: true };
  const owned = (await deps.projectStore.listProjects()).filter((p) => p.ownerUid === account.uid);
  if (owned.length >= account.quotas.maxProjects) {
    return { ok: false, error: `project quota reached (${account.quotas.maxProjects} max)` };
  }
  return { ok: true };
}

/** Concurrent agent runs = non-terminal Discovery jobs + Research runs across
 * every film/project this account owns. Loops per-owned-resource rather than
 * a Firestore collection-group query, since maxFilms/maxProjects already
 * caps how many there are — see docs/adr/0028. */
export async function assertWithinRunQuota(
  deps: { filmStore: FilmStore; projectStore: ProjectStore; discoveryJobStore: DiscoveryJobStore; researchRunStore: ResearchRunStore },
  account: Account,
): Promise<QuotaCheck> {
  if (isExempt(account)) return { ok: true };

  const [films, projects] = await Promise.all([
    deps.filmStore.listFilms().then((all) => all.filter((f) => f.ownerUid === account.uid)),
    deps.projectStore.listProjects().then((all) => all.filter((p) => p.ownerUid === account.uid)),
  ]);
  const [jobLists, runLists] = await Promise.all([
    Promise.all(films.map((f) => deps.discoveryJobStore.listJobs(f.id))),
    Promise.all(projects.map((p) => deps.researchRunStore.listRuns(p.id))),
  ]);
  const activeJobs = jobLists.flat().filter((j) => NON_TERMINAL_JOB_STATUSES.has(j.status)).length;
  const activeRuns = runLists.flat().filter((r) => NON_TERMINAL_RUN_STATUSES.has(r.status)).length;

  if (activeJobs + activeRuns >= account.quotas.maxConcurrentAgentRuns) {
    return { ok: false, error: `concurrent agent run quota reached (${account.quotas.maxConcurrentAgentRuns} max)` };
  }
  return { ok: true };
}
