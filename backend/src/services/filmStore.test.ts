import { describe, it, expect } from 'vitest';
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
  });

  it('createFilm returns a processed film with server-assigned ids on its details', () => {
    const store = createFilmStore(FIXTURE);
    const film = store.createFilm({ title: 'New Film', script: 'x', videoUrl: 'https://example.com/x.mp4' });
    expect(film.id).toBeTruthy();
    expect(film.status).toBe('processed');
    expect(film.details).toHaveLength(2);
    expect(film.details.every((d) => d.id)).toBe(true);
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
});
