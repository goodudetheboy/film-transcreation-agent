import { describe, it, expect } from 'vitest';
import { assertWithinFilmQuota, assertWithinProjectQuota, assertWithinRunQuota } from '../services/quota.js';
import { createInMemoryFilmStore } from '../services/filmStore.js';
import { createInMemoryProjectStore } from '../services/projectStore.js';
import { createInMemoryDiscoveryJobStore } from '../services/discoveryJobStore.js';
import { createInMemoryResearchRunStore } from '../services/researchRunStore.js';
import type { Account } from '../services/accountTypes.js';

const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';

function userAccount(quotas: Account['quotas']): Account {
  return {
    uid: OWNER_UID,
    email: 'owner@test.dev',
    role: 'user',
    label: 'Owner',
    quotas,
    disabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test-admin-uid',
  };
}

function adminAccount(quotas: Account['quotas']): Account {
  return {
    uid: 'admin-uid',
    email: 'admin@test.dev',
    role: 'admin',
    label: 'Admin',
    quotas,
    disabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test-admin-uid',
  };
}

describe('assertWithinFilmQuota', () => {
  it('is not ok at cap', async () => {
    const filmStore = createInMemoryFilmStore();
    await filmStore.createFilm({ title: 'A', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid: OWNER_UID });
    const account = userAccount({ maxFilms: 1, maxProjects: 10, maxConcurrentAgentRuns: 10 });

    const result = await assertWithinFilmQuota({ filmStore }, account);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('film quota reached');
  });

  it('is ok under cap', async () => {
    const filmStore = createInMemoryFilmStore();
    await filmStore.createFilm({ title: 'A', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid: OWNER_UID });
    const account = userAccount({ maxFilms: 2, maxProjects: 10, maxConcurrentAgentRuns: 10 });

    const result = await assertWithinFilmQuota({ filmStore }, account);

    expect(result.ok).toBe(true);
  });

  it('admin accounts are always exempt, regardless of how many films they own', async () => {
    const filmStore = createInMemoryFilmStore();
    const admin = adminAccount({ maxFilms: 1, maxProjects: 1, maxConcurrentAgentRuns: 1 });
    await filmStore.createFilm({ title: 'A', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid: admin.uid });
    await filmStore.createFilm({ title: 'B', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid: admin.uid });
    await filmStore.createFilm({ title: 'C', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid: admin.uid });

    const result = await assertWithinFilmQuota({ filmStore }, admin);

    expect(result.ok).toBe(true);
  });

  it('only counts films owned by this account', async () => {
    const filmStore = createInMemoryFilmStore();
    await filmStore.createFilm({ title: 'Someone else’s', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid: OTHER_UID });
    const account = userAccount({ maxFilms: 1, maxProjects: 10, maxConcurrentAgentRuns: 10 });

    const result = await assertWithinFilmQuota({ filmStore }, account);

    expect(result.ok).toBe(true);
  });
});

describe('assertWithinProjectQuota', () => {
  it('is not ok at cap', async () => {
    const projectStore = createInMemoryProjectStore();
    await projectStore.createProject({ name: 'P', country: 'Japan', sourceFilmId: 'film-1', ownerUid: OWNER_UID });
    const account = userAccount({ maxFilms: 10, maxProjects: 1, maxConcurrentAgentRuns: 10 });

    const result = await assertWithinProjectQuota({ projectStore }, account);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('project quota reached');
  });

  it('is ok under cap', async () => {
    const projectStore = createInMemoryProjectStore();
    await projectStore.createProject({ name: 'P', country: 'Japan', sourceFilmId: 'film-1', ownerUid: OWNER_UID });
    const account = userAccount({ maxFilms: 10, maxProjects: 2, maxConcurrentAgentRuns: 10 });

    const result = await assertWithinProjectQuota({ projectStore }, account);

    expect(result.ok).toBe(true);
  });

  it('admin accounts are always exempt, regardless of how many projects they own', async () => {
    const projectStore = createInMemoryProjectStore();
    const admin = adminAccount({ maxFilms: 1, maxProjects: 1, maxConcurrentAgentRuns: 1 });
    await projectStore.createProject({ name: 'P1', country: 'Japan', sourceFilmId: 'film-1', ownerUid: admin.uid });
    await projectStore.createProject({ name: 'P2', country: 'Japan', sourceFilmId: 'film-1', ownerUid: admin.uid });

    const result = await assertWithinProjectQuota({ projectStore }, admin);

    expect(result.ok).toBe(true);
  });

  it('only counts projects owned by this account', async () => {
    const projectStore = createInMemoryProjectStore();
    await projectStore.createProject({ name: 'Someone else’s', country: 'Japan', sourceFilmId: 'film-1', ownerUid: OTHER_UID });
    const account = userAccount({ maxFilms: 10, maxProjects: 1, maxConcurrentAgentRuns: 10 });

    const result = await assertWithinProjectQuota({ projectStore }, account);

    expect(result.ok).toBe(true);
  });
});

describe('assertWithinRunQuota', () => {
  async function seedFilmWithJob(filmStore: ReturnType<typeof createInMemoryFilmStore>, discoveryJobStore: ReturnType<typeof createInMemoryDiscoveryJobStore>, ownerUid: string, status: 'queued' | 'running' | 'done' | 'error') {
    const film = await filmStore.createFilm({ title: 'A', videoUrl: 'gs://v', subtitle: null, runDiscoveryOnCreate: false, ownerUid });
    const job = await discoveryJobStore.createJob({ filmId: film.id, specialInstruction: '', targetColumns: ['segmentDescription'], testMode: true });
    await discoveryJobStore.updateJob(film.id, job.id, { status });
    return film;
  }

  it('is not ok at cap when a non-terminal discovery job counts toward the run quota', async () => {
    const filmStore = createInMemoryFilmStore();
    const projectStore = createInMemoryProjectStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const researchRunStore = createInMemoryResearchRunStore();
    await seedFilmWithJob(filmStore, discoveryJobStore, OWNER_UID, 'queued');
    const account = userAccount({ maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 1 });

    const result = await assertWithinRunQuota({ filmStore, projectStore, discoveryJobStore, researchRunStore }, account);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('concurrent agent run quota reached');
  });

  it('is ok under cap', async () => {
    const filmStore = createInMemoryFilmStore();
    const projectStore = createInMemoryProjectStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const researchRunStore = createInMemoryResearchRunStore();
    await seedFilmWithJob(filmStore, discoveryJobStore, OWNER_UID, 'queued');
    const account = userAccount({ maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 2 });

    const result = await assertWithinRunQuota({ filmStore, projectStore, discoveryJobStore, researchRunStore }, account);

    expect(result.ok).toBe(true);
  });

  it('admin accounts are always exempt', async () => {
    const filmStore = createInMemoryFilmStore();
    const projectStore = createInMemoryProjectStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const researchRunStore = createInMemoryResearchRunStore();
    const admin = adminAccount({ maxFilms: 1, maxProjects: 1, maxConcurrentAgentRuns: 1 });
    await seedFilmWithJob(filmStore, discoveryJobStore, admin.uid, 'queued');
    await seedFilmWithJob(filmStore, discoveryJobStore, admin.uid, 'running');

    const result = await assertWithinRunQuota({ filmStore, projectStore, discoveryJobStore, researchRunStore }, admin);

    expect(result.ok).toBe(true);
  });

  it('only counts jobs/runs on films/projects owned by this account', async () => {
    const filmStore = createInMemoryFilmStore();
    const projectStore = createInMemoryProjectStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const researchRunStore = createInMemoryResearchRunStore();
    await seedFilmWithJob(filmStore, discoveryJobStore, OTHER_UID, 'queued');
    const account = userAccount({ maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 1 });

    const result = await assertWithinRunQuota({ filmStore, projectStore, discoveryJobStore, researchRunStore }, account);

    expect(result.ok).toBe(true);
  });

  it('excludes terminal ("done"/"error") jobs and runs from the count', async () => {
    const filmStore = createInMemoryFilmStore();
    const projectStore = createInMemoryProjectStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const researchRunStore = createInMemoryResearchRunStore();
    await seedFilmWithJob(filmStore, discoveryJobStore, OWNER_UID, 'done');

    const project = await projectStore.createProject({ name: 'P', country: 'Japan', sourceFilmId: 'film-1', ownerUid: OWNER_UID });
    const run = await researchRunStore.createRun({ projectId: project.id, mode: 'need-research', itemIds: [], rubricIds: [], testMode: true });
    await researchRunStore.updateRun(project.id, run.id, { status: 'error' });

    const account = userAccount({ maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 1 });

    const result = await assertWithinRunQuota({ filmStore, projectStore, discoveryJobStore, researchRunStore }, account);

    expect(result.ok).toBe(true);
  });

  it('a non-terminal research run counts toward the run quota', async () => {
    const filmStore = createInMemoryFilmStore();
    const projectStore = createInMemoryProjectStore();
    const discoveryJobStore = createInMemoryDiscoveryJobStore();
    const researchRunStore = createInMemoryResearchRunStore();
    const project = await projectStore.createProject({ name: 'P', country: 'Japan', sourceFilmId: 'film-1', ownerUid: OWNER_UID });
    await researchRunStore.createRun({ projectId: project.id, mode: 'need-research', itemIds: [], rubricIds: [], testMode: true });
    const account = userAccount({ maxFilms: 10, maxProjects: 10, maxConcurrentAgentRuns: 1 });

    const result = await assertWithinRunQuota({ filmStore, projectStore, discoveryJobStore, researchRunStore }, account);

    expect(result.ok).toBe(false);
  });
});
