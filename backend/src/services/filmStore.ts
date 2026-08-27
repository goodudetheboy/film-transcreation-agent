import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FixtureDetail } from '../fixtures/insideOutDetails.js';
import type { DialogueLine, GestureLog } from './captioningClient.js';

export interface FilmDetail {
  id: string;
  scriptLine: string;
  sceneDescription: string;
}

export type FilmStatus = 'processing' | 'processed';

export interface FilmPreprocessing {
  dialogue: DialogueLine[];
  gestures: GestureLog[];
}

export interface Film {
  id: string;
  title: string;
  script: string;
  videoUrl: string;
  status: FilmStatus;
  details: FilmDetail[];
  preprocessing: FilmPreprocessing | null;
  createdAt: string;
}

export interface CreateFilmInput {
  title: string;
  script: string;
  videoUrl: string;
}

/**
 * File-backed (see docs/adr/0016): films persist to a local JSON file across
 * restarts — no real database. "Discovery" is still entirely mocked — every film
 * gets the same canned candidate details regardless of the script/video actually
 * submitted, same "fixed content, not derived from input" convention as
 * mockResearchAgent.ts (docs/adr/0010).
 */
export interface FilmStore {
  createFilm(input: CreateFilmInput): Film;
  getFilm(id: string): Film | undefined;
  listFilms(): Film[];
  updatePreprocessing(id: string, preprocessing: FilmPreprocessing): Film | undefined;
  deleteFilm(id: string): boolean;
}

export function createFilmStore(
  mockDetails: FixtureDetail[],
  seedFilms: Array<Omit<Film, 'id' | 'createdAt' | 'details' | 'status' | 'preprocessing'>> = [],
  persistPath?: string,
): FilmStore {
  const films = new Map<string, Film>();

  function detailsFromFixture(): FilmDetail[] {
    return mockDetails.map((d) => ({ id: randomUUID(), ...d }));
  }

  function persist(): void {
    if (!persistPath) return;
    mkdirSync(dirname(persistPath), { recursive: true });
    writeFileSync(persistPath, JSON.stringify([...films.values()], null, 2));
  }

  let loadedFromDisk = false;
  if (persistPath && existsSync(persistPath)) {
    const saved = JSON.parse(readFileSync(persistPath, 'utf-8')) as Film[];
    for (const film of saved) {
      films.set(film.id, film);
    }
    loadedFromDisk = true;
  }

  if (!loadedFromDisk) {
    for (const seed of seedFilms) {
      const film: Film = {
        id: randomUUID(),
        ...seed,
        status: 'processed',
        details: detailsFromFixture(),
        preprocessing: null,
        createdAt: new Date().toISOString(),
      };
      films.set(film.id, film);
    }
    persist();
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
        preprocessing: null,
        createdAt: new Date().toISOString(),
      };
      films.set(film.id, film);
      persist();
      return film;
    },

    getFilm(id) {
      return films.get(id);
    },

    listFilms() {
      return [...films.values()];
    },

    updatePreprocessing(id, preprocessing) {
      const film = films.get(id);
      if (!film) return undefined;
      const updated: Film = { ...film, preprocessing };
      films.set(id, updated);
      persist();
      return updated;
    },

    deleteFilm(id) {
      const deleted = films.delete(id);
      if (deleted) persist();
      return deleted;
    },
  };
}
