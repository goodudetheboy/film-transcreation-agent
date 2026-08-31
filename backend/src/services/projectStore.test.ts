import { describe, it, expect } from 'vitest';
import { createInMemoryProjectStore } from './projectStore.js';

describe('createInMemoryProjectStore', () => {
  it('createProject defaults note to empty string and status to draft', async () => {
    const store = createInMemoryProjectStore();
    const project = await store.createProject({ name: 'Japan — Inside Out', country: 'Japan', sourceFilmId: 'film-a' });
    expect(project.note).toBe('');
    expect(project.status).toBe('draft');
    expect(project.sourceFilmId).toBe('film-a');
    expect(project.id).toBeTruthy();
  });

  it('getProject/listProjects round-trip, newest first', async () => {
    const store = createInMemoryProjectStore();
    const a = await store.createProject({ name: 'A', country: 'Japan', sourceFilmId: 'film-a' });
    await new Promise((r) => setTimeout(r, 2)); // ensure a distinct createdAt for a deterministic sort order
    const b = await store.createProject({ name: 'B', country: 'France', sourceFilmId: 'film-a' });
    expect(await store.getProject(a.id)).toEqual(a);
    expect(await store.getProject('missing')).toBeUndefined();
    const listed = await store.listProjects();
    expect(listed.map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('updateProject patches allowed fields and bumps updatedAt; undefined for missing id', async () => {
    const store = createInMemoryProjectStore();
    const project = await store.createProject({ name: 'A', country: 'Japan', sourceFilmId: 'film-a' });
    const updated = await store.updateProject(project.id, { name: 'Renamed', status: 'in_progress' });
    expect(updated?.name).toBe('Renamed');
    expect(updated?.status).toBe('in_progress');
    expect(await store.updateProject('missing', { name: 'x' })).toBeUndefined();
  });

  it('deleteProject removes the project', async () => {
    const store = createInMemoryProjectStore();
    const project = await store.createProject({ name: 'A', country: 'Japan', sourceFilmId: 'film-a' });
    expect(await store.deleteProject('missing')).toBe(false);
    expect(await store.deleteProject(project.id)).toBe(true);
    expect(await store.getProject(project.id)).toBeUndefined();
  });
});
