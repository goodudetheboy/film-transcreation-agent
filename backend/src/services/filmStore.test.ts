import { describe, it, expect } from 'vitest';
import { createInMemoryFilmStore } from './filmStore.js';
import type { CreateFilmInput } from './filmTypes.js';

const SUBTITLE: CreateFilmInput['subtitle'] = {
  fileUrl: 'gs://bucket/subtitles/x.srt',
  format: 'srt',
  entries: [{ id: 'e1', index: 0, startMs: 0, endMs: 2000, text: 'Hello' }],
};

function input(overrides: Partial<CreateFilmInput> = {}): CreateFilmInput {
  return {
    title: 'New Film',
    videoUrl: 'gs://bucket/video.mp4',
    subtitle: SUBTITLE,
    runDiscoveryOnCreate: false,
    ...overrides,
  };
}

describe('createInMemoryFilmStore', () => {
  it('createFilm starts a film "processing", with prep at discovery_running or finalizing depending on runDiscoveryOnCreate', async () => {
    const store = createInMemoryFilmStore();

    const withDiscovery = await store.createFilm(input({ runDiscoveryOnCreate: true }));
    expect(withDiscovery.status).toBe('processing');
    expect(withDiscovery.prep.stage).toBe('discovery_running');
    expect(withDiscovery.prep.videoDone).toBe(true);
    expect(withDiscovery.prep.subtitleDone).toBe(true);

    const withoutDiscovery = await store.createFilm(input({ runDiscoveryOnCreate: false }));
    expect(withoutDiscovery.prep.stage).toBe('finalizing');
  });

  it('getFilm/listFilms round-trip a created film', async () => {
    const store = createInMemoryFilmStore();
    const film = await store.createFilm(input({ title: 'X' }));
    expect(await store.getFilm(film.id)).toEqual(film);
    expect((await store.listFilms()).some((f) => f.id === film.id)).toBe(true);
  });

  it('getFilm returns undefined for an unknown id', async () => {
    const store = createInMemoryFilmStore();
    expect(await store.getFilm('does-not-exist')).toBeUndefined();
  });

  it('updateFilm merges a patch and bumps updatedAt, returning undefined for an unknown id', async () => {
    const store = createInMemoryFilmStore();
    const film = await store.createFilm(input());
    const updated = await store.updateFilm(film.id, { status: 'processed' });
    expect(updated?.status).toBe('processed');
    expect(updated?.title).toBe(film.title);
    expect(await store.updateFilm('does-not-exist', { status: 'processed' })).toBeUndefined();
  });

  it('deleteFilm removes the film and returns true; returns false for an unknown id', async () => {
    const store = createInMemoryFilmStore();
    const film = await store.createFilm(input());
    expect(await store.deleteFilm('does-not-exist')).toBe(false);
    expect(await store.deleteFilm(film.id)).toBe(true);
    expect(await store.getFilm(film.id)).toBeUndefined();
  });

  it('seeds already-"processed"/"ready" films from the constructor', async () => {
    const store = createInMemoryFilmStore([input({ title: 'Seeded' })]);
    const films = await store.listFilms();
    expect(films).toHaveLength(1);
    expect(films[0].status).toBe('processed');
    expect(films[0].prep.stage).toBe('ready');
  });
});
