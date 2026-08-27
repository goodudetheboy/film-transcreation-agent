import type { DialogueLine, Film, GestureLog, Project, Rubric } from './apiClient.types';
import { resolveBaseUrl, throwOnError, type ApiClientOptions } from './httpHelpers';

export type { ApiClientOptions };

export interface CreateFilmPayload {
  passcode: string;
  title: string;
  script: string;
  videoUrl: string;
  testMode: boolean;
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

export interface UploadVideoFileOptions {
  passcode: string;
  testMode: boolean;
}

/** Uploads a local video file (e.g. drag-and-dropped) and returns its gs:// URI. */
export async function uploadVideoFile(
  file: File,
  { passcode, testMode }: UploadVideoFileOptions,
  options: ApiClientOptions = {},
): Promise<{ videoUrl: string }> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const form = new FormData();
  form.append('video', file);
  form.append('testMode', String(testMode));

  const res = await fetchImpl(`${baseUrl}/api/films/upload-video?passcode=${encodeURIComponent(passcode)}`, {
    method: 'POST',
    body: form,
  });
  await throwOnError(res);
  return (await res.json()) as { videoUrl: string };
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

export async function savePreprocessing(
  filmId: string,
  payload: { passcode: string; dialogue: DialogueLine[]; gestures: GestureLog[] },
  options: ApiClientOptions = {},
): Promise<Film> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/preprocessing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as Film;
}

export async function deleteFilm(filmId: string, passcode: string, options: ApiClientOptions = {}): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}?passcode=${encodeURIComponent(passcode)}`, {
    method: 'DELETE',
  });
  await throwOnError(res);
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
