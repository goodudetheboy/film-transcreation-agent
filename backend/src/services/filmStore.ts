import { randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { CreateFilmInput, Film, FilmPrep } from './filmTypes.js';

export type { Film, CreateFilmInput, FilmPrep, FilmSubtitle, FilmStatus, FilmPrepStage } from './filmTypes.js';

/**
 * Firestore-backed film store (see docs/adr/0018, supersedes the file-backed
 * approach in docs/adr/0016). A film's `detailRows`/`columns`/`discoveryJobs`
 * live in Firestore subcollections owned by detailRowsStore.ts/
 * discoveryJobStore.ts, not here — this store only owns the `films/{id}`
 * document itself.
 */
export interface FilmStore {
  createFilm(input: CreateFilmInput): Promise<Film>;
  getFilm(id: string): Promise<Film | undefined>;
  listFilms(): Promise<Film[]>;
  updateFilm(id: string, patch: Partial<Omit<Film, 'id' | 'createdAt'>>): Promise<Film | undefined>;
  deleteFilm(id: string): Promise<boolean>;
}

const FILMS_COLLECTION = 'films';

/**
 * Films are created via POST /api/films only after the video and subtitle were
 * already uploaded through their own endpoints — so by the time the film
 * document exists, both are already done, and the pipeline (filmPrepPipeline.ts)
 * picks up from either the discovery or finalize stage.
 */
function initialPrep(runDiscoveryOnCreate: boolean, now: string): FilmPrep {
  return {
    stage: runDiscoveryOnCreate ? 'discovery_running' : 'finalizing',
    videoDone: true,
    subtitleDone: true,
    discoveryJobId: null,
    discoveryDone: false,
    finalizeDone: false,
    log: [{ ts: now, message: 'Video and subtitle uploaded.' }],
  };
}

/** Only used to seed already-fully-processed films for local dev/tests. */
function readyPrep(now: string): FilmPrep {
  return {
    stage: 'ready',
    videoDone: true,
    subtitleDone: true,
    discoveryJobId: null,
    discoveryDone: false,
    finalizeDone: true,
    log: [{ ts: now, message: 'Seeded as ready.' }],
  };
}

export function createFirestoreFilmStore(firestore: Firestore): FilmStore {
  const collection = firestore.collection(FILMS_COLLECTION);

  return {
    async createFilm(input) {
      const now = new Date().toISOString();
      const film: Film = {
        id: randomUUID(),
        title: input.title,
        videoUrl: input.videoUrl,
        subtitle: input.subtitle,
        runDiscoveryOnCreate: input.runDiscoveryOnCreate,
        prep: initialPrep(input.runDiscoveryOnCreate, now),
        status: 'processing',
        createdAt: now,
        updatedAt: now,
      };
      await collection.doc(film.id).set(film);
      return film;
    },

    async getFilm(id) {
      const doc = await collection.doc(id).get();
      return doc.exists ? (doc.data() as Film) : undefined;
    },

    async listFilms() {
      const snapshot = await collection.orderBy('createdAt', 'desc').get();
      return snapshot.docs.map((d) => d.data() as Film);
    },

    async updateFilm(id, patch) {
      const ref = collection.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return undefined;
      const updated: Film = { ...(doc.data() as Film), ...patch, updatedAt: new Date().toISOString() };
      await ref.set(updated);
      return updated;
    },

    async deleteFilm(id) {
      const ref = collection.doc(id);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await firestore.recursiveDelete(ref);
      return true;
    },
  };
}

/**
 * In-memory fake with the identical interface/semantics, for unit tests and
 * anywhere a real Firestore connection isn't wanted — the only thing CLAUDE.md
 * permits faking is exactly this kind of external Google client.
 */
export function createInMemoryFilmStore(seedFilms: CreateFilmInput[] = []): FilmStore {
  const films = new Map<string, Film>();

  function seed(input: CreateFilmInput): Film {
    const now = new Date().toISOString();
    const film: Film = {
      id: randomUUID(),
      title: input.title,
      videoUrl: input.videoUrl,
      subtitle: input.subtitle,
      runDiscoveryOnCreate: input.runDiscoveryOnCreate,
      prep: readyPrep(now),
      status: 'processed',
      createdAt: now,
      updatedAt: now,
    };
    films.set(film.id, film);
    return film;
  }
  for (const s of seedFilms) seed(s);

  return {
    async createFilm(input) {
      const now = new Date().toISOString();
      const film: Film = {
        id: randomUUID(),
        title: input.title,
        videoUrl: input.videoUrl,
        subtitle: input.subtitle,
        runDiscoveryOnCreate: input.runDiscoveryOnCreate,
        prep: initialPrep(input.runDiscoveryOnCreate, now),
        status: 'processing',
        createdAt: now,
        updatedAt: now,
      };
      films.set(film.id, film);
      return film;
    },

    async getFilm(id) {
      return films.get(id);
    },

    async listFilms() {
      return [...films.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async updateFilm(id, patch) {
      const film = films.get(id);
      if (!film) return undefined;
      const updated: Film = { ...film, ...patch, updatedAt: new Date().toISOString() };
      films.set(id, updated);
      return updated;
    },

    async deleteFilm(id) {
      return films.delete(id);
    },
  };
}
