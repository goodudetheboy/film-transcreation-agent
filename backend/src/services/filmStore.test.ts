import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilmStore } from './filmStore.js';
import type { FixtureDetail } from '../fixtures/insideOutDetails.js';

const FIXTURE: FixtureDetail[] = [
  { scriptLine: 'a', sceneDescription: 'b' },
  { scriptLine: '', sceneDescription: 'c' },
];

describe('createFilmStore', () => {
  it('starts with any seed films already processed, with details from the fixture', () => {
    const store = createFilmStore(FIXTURE, [
      { title: 'Sample Film', script: 'script text', videoUrl: 'https://example.com/v.mp4' },
    ]);
    const films = store.listFilms();
    expect(films).toHaveLength(1);
    expect(films[0].status).toBe('processed');
    expect(films[0].details).toHaveLength(2);
    expect(films[0].details[0].id).toBeTruthy();
    expect(films[0].preprocessing).toBeNull();
  });

  it('createFilm returns a processed film with server-assigned ids on its details', () => {
    const store = createFilmStore(FIXTURE);
    const film = store.createFilm({ title: 'New Film', script: 'x', videoUrl: 'https://example.com/x.mp4' });
    expect(film.id).toBeTruthy();
    expect(film.status).toBe('processed');
    expect(film.details).toHaveLength(2);
    expect(film.details.every((d) => d.id)).toBe(true);
    expect(film.preprocessing).toBeNull();
  });

  it('gives the same canned details to every film, regardless of the submitted script', () => {
    const store = createFilmStore(FIXTURE);
    const a = store.createFilm({ title: 'A', script: 'one script', videoUrl: 'https://example.com/a.mp4' });
    const b = store.createFilm({ title: 'B', script: 'a totally different script', videoUrl: 'https://example.com/b.mp4' });
    expect(a.details.map((d) => d.sceneDescription)).toEqual(b.details.map((d) => d.sceneDescription));
  });

  it('getFilm fetches a created film by id, listFilms includes it', () => {
    const store = createFilmStore(FIXTURE);
    const film = store.createFilm({ title: 'X', script: 'x', videoUrl: 'https://example.com/x.mp4' });
    expect(store.getFilm(film.id)).toEqual(film);
    expect(store.listFilms().some((f) => f.id === film.id)).toBe(true);
  });

  it('getFilm returns undefined for an unknown id', () => {
    const store = createFilmStore(FIXTURE);
    expect(store.getFilm('does-not-exist')).toBeUndefined();
  });

  it('updatePreprocessing saves dialogue/gestures onto the film and returns the updated film', () => {
    const store = createFilmStore(FIXTURE);
    const film = store.createFilm({ title: 'X', script: 'x', videoUrl: 'https://example.com/x.mp4' });

    const preprocessing = {
      dialogue: [{ timecode: '00:01', character: 'Joy', text: 'Hi!' }],
      gestures: [],
    };
    const updated = store.updatePreprocessing(film.id, preprocessing);

    expect(updated?.preprocessing).toEqual(preprocessing);
    expect(store.getFilm(film.id)?.preprocessing).toEqual(preprocessing);
  });

  it('updatePreprocessing returns undefined for an unknown id', () => {
    const store = createFilmStore(FIXTURE);
    expect(store.updatePreprocessing('does-not-exist', { dialogue: [], gestures: [] })).toBeUndefined();
  });

  it('deleteFilm removes the film and returns true; returns false for an unknown id', () => {
    const store = createFilmStore(FIXTURE);
    const film = store.createFilm({ title: 'X', script: 'x', videoUrl: 'https://example.com/x.mp4' });

    expect(store.deleteFilm('does-not-exist')).toBe(false);
    expect(store.deleteFilm(film.id)).toBe(true);
    expect(store.getFilm(film.id)).toBeUndefined();
    expect(store.listFilms()).toHaveLength(0);
  });
});

describe('createFilmStore with file persistence', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes seed films to disk on first run, then loads from disk on the next run (ignoring seeds)', () => {
    dir = mkdtempSync(join(tmpdir(), 'filmstore-test-'));
    const file = join(dir, 'films.json');

    const store1 = createFilmStore(FIXTURE, [{ title: 'Seeded', script: 's', videoUrl: 'https://example.com/s.mp4' }], file);
    const seededId = store1.listFilms()[0].id;
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toHaveLength(1);

    // Second run with different (or no) seeds: disk state wins.
    const store2 = createFilmStore(FIXTURE, [{ title: 'Different Seed', script: 's', videoUrl: 'https://example.com/d.mp4' }], file);
    const films2 = store2.listFilms();
    expect(films2).toHaveLength(1);
    expect(films2[0].id).toBe(seededId);
    expect(films2[0].title).toBe('Seeded');
  });

  it('persists creates, preprocessing updates, and deletes to disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'filmstore-test-'));
    const file = join(dir, 'films.json');

    const store1 = createFilmStore(FIXTURE, [], file);
    const film = store1.createFilm({ title: 'X', script: 'x', videoUrl: 'https://example.com/x.mp4' });
    store1.updatePreprocessing(film.id, { dialogue: [{ timecode: '00:01', character: 'Joy', text: 'Hi!' }], gestures: [] });

    const store2 = createFilmStore(FIXTURE, [], file);
    expect(store2.getFilm(film.id)?.preprocessing?.dialogue).toHaveLength(1);

    store2.deleteFilm(film.id);
    const store3 = createFilmStore(FIXTURE, [], file);
    expect(store3.getFilm(film.id)).toBeUndefined();
  });
});
