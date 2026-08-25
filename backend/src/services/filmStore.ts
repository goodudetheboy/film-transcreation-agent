import { randomUUID } from 'node:crypto';
import type { FixtureDetail } from '../fixtures/insideOutDetails.js';

export interface FilmDetail {
  id: string;
  scriptLine: string;
  sceneDescription: string;
}

export type FilmStatus = 'processing' | 'processed';

export interface Film {
  id: string;
  title: string;
  script: string;
  videoUrl: string;
  status: FilmStatus;
  details: FilmDetail[];
  createdAt: string;
}

export interface CreateFilmInput {
  title: string;
  script: string;
  videoUrl: string;
}

/**
 * In-memory only, same tradeoff as projectStore.ts (see docs/adr/0013). "Discovery"
 * here is entirely mocked — every film gets the same canned candidate details
 * regardless of the script/video actually submitted, same "fixed content, not
 * derived from input" convention as mockDialogflowClient.ts / mockResearchAgent.ts
 * (docs/adr/0010). This validates the Film -> Project pipeline shape, not real
 * discovery quality.
 */
export interface FilmStore {
  createFilm(input: CreateFilmInput): Film;
  getFilm(id: string): Film | undefined;
  listFilms(): Film[];
}

export function createFilmStore(
  mockDetails: FixtureDetail[],
  seedFilms: Array<Omit<Film, 'id' | 'createdAt' | 'details' | 'status'>> = [],
): FilmStore {
  const films = new Map<string, Film>();

  function detailsFromFixture(): FilmDetail[] {
    return mockDetails.map((d) => ({ id: randomUUID(), ...d }));
  }

  for (const seed of seedFilms) {
    const film: Film = {
      id: randomUUID(),
      ...seed,
      status: 'processed',
      details: detailsFromFixture(),
      createdAt: new Date().toISOString(),
    };
    films.set(film.id, film);
  }

  return {
    createFilm(input) {
      const film: Film = {
        id: randomUUID(),
        title: input.title,
        script: input.script,
        videoUrl: input.videoUrl,
        status: 'processed',
        details: detailsFromFixture(),
        createdAt: new Date().toISOString(),
      };
      films.set(film.id, film);
      return film;
    },

    getFilm(id) {
      return films.get(id);
    },

    listFilms() {
      return [...films.values()];
    },
  };
}
