import type { Film, Project, Rubric } from './apiClient.types';
import { resolveBaseUrl, throwOnError, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

export interface CreateFilmPayload {
  passcode: string;
  title: string;
  script: string;
  videoUrl: string;
}

export async function createFilm(payload: CreateFilmPayload, options: ApiClientOptions = {}): Promise<Film> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Film;
}

export async function listFilms(passcode: string, options: ApiClientOptions = {}): Promise<Film[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as Film[];
}

export async function getFilm(id: string, passcode: string, options: ApiClientOptions = {}): Promise<Film> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${id}?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as Film;
}

export interface CreateProjectFromFilmPayload {
  passcode: string;
  country: string;
  rubrics?: Rubric[];
}

export async function createProjectFromFilm(
  filmId: string,
  payload: CreateProjectFromFilmPayload,
  options: ApiClientOptions = {},
): Promise<Project> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/create-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Project;
}
