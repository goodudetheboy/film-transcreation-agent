import type {
  ColumnDoc,
  DetailRow,
  DetailRowValues,
  DiscoveryJob,
  DiscoveryJobStreamEvent,
  DiscoveryJobSummary,
  Film,
  FilmPrepStreamEvent,
  Project,
  Rubric,
  SubtitleEntry,
} from './apiClient.types';
import { parseSSEStream } from './sseStream';
import { resolveBaseUrl, describeError, throwOnError, type ApiClientOptions } from './httpHelpers';
import { uploadFileResumable } from './resumableUpload';

export type { ApiClientOptions };

// ---- Uploads --------------------------------------------------------------

export interface UploadOptions {
  passcode: string;
  testMode: boolean;
}

/**
 * Uploads a local video file (e.g. drag-and-dropped) and returns its gs:// URI.
 *
 * Mock mode keeps posting the file straight to the backend (fine for small test
 * clips). Real mode uploads directly to GCS in chunks instead — Cloud Run has a
 * hard, non-configurable 32MB request-size limit that any real film blows past,
 * so the video bytes must never go through it. See
 * docs/adr/0024-direct-to-gcs-video-uploads.md for the full writeup of why.
 *
 * The final chunk's response is never readable in a browser (GCS's completion
 * response never carries CORS headers), so `uploadFileResumable` can't confirm
 * success on its own — this calls the backend's /finalize endpoint afterward,
 * which isn't subject to browser CORS and can genuinely verify the object
 * exists with the right size (also enforcing the size cap server-side, since
 * a client can lie about the size it declares at /init time).
 */
export async function uploadVideoFile(
  file: File,
  { passcode, testMode }: UploadOptions,
  options: ApiClientOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<{ videoUrl: string }> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (testMode) {
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

  const initRes = await fetchImpl(`${baseUrl}/api/films/upload-video/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode, filename: file.name, contentType: file.type, size: file.size, testMode }),
  });
  await throwOnError(initRes);
  const { uploadUrl, videoUrl } = (await initRes.json()) as { uploadUrl: string; videoUrl: string };

  await uploadFileResumable(uploadUrl, file, { onProgress, fetchImpl });

  const finalizeRes = await fetchImpl(`${baseUrl}/api/films/upload-video/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode, videoUrl, testMode }),
  });
  await throwOnError(finalizeRes);

  return { videoUrl };
}

export interface UploadSubtitleResult {
  subtitleUrl: string;
  format: 'srt' | 'vtt';
  entries: SubtitleEntry[];
}

/** Uploads a local .srt/.vtt file and returns its gs:// URI plus the parsed cues. */
export async function uploadSubtitleFile(
  file: File,
  { passcode, testMode }: UploadOptions,
  options: ApiClientOptions = {},
): Promise<UploadSubtitleResult> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const form = new FormData();
  form.append('subtitle', file);
  form.append('testMode', String(testMode));

  const res = await fetchImpl(`${baseUrl}/api/films/upload-subtitle?passcode=${encodeURIComponent(passcode)}`, {
    method: 'POST',
    body: form,
  });
  await throwOnError(res);
  return (await res.json()) as UploadSubtitleResult;
}

// ---- Film creation & prep --------------------------------------------------

export interface CreateFilmPayload {
  passcode: string;
  title: string;
  videoUrl: string;
  subtitleUrl: string;
  subtitleFormat: 'srt' | 'vtt';
  subtitleEntries: SubtitleEntry[];
  runDiscovery: boolean;
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

/** Streams a film's prep progress — replays history then follows live until ready/error. */
export async function streamFilmPrep(
  filmId: string,
  passcode: string,
  onEvent: (event: FilmPrepStreamEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/prep-status?passcode=${encodeURIComponent(passcode)}`);
  if (!res.ok) {
    const detail = await describeError(res);
    onEvent({ type: 'prep_update', prep: { stage: 'error', videoDone: true, subtitleDone: true, discoveryJobId: null, discoveryDone: false, finalizeDone: false, log: [], errorMessage: detail || `request failed with status ${res.status}` } });
    return;
  }
  if (!res.body) return;
  await parseSSEStream<FilmPrepStreamEvent>(res, onEvent, (event) => event.prep.stage === 'ready' || event.prep.stage === 'error');
}

// ---- Films ------------------------------------------------------------------

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

export async function deleteFilm(filmId: string, passcode: string, options: ApiClientOptions = {}): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}?passcode=${encodeURIComponent(passcode)}`, {
    method: 'DELETE',
  });
  await throwOnError(res);
}

// ---- Details table ------------------------------------------------------------

export async function listDetails(
  filmId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<{ rows: DetailRow[]; columns: ColumnDoc[] }> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/details?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as { rows: DetailRow[]; columns: ColumnDoc[] };
}

export async function addDetailRow(
  filmId: string,
  payload: { passcode: string; startMs: number; endMs: number; values?: Partial<DetailRowValues> },
  options: ApiClientOptions = {},
): Promise<DetailRow> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DetailRow;
}

export async function updateDetailRow(
  filmId: string,
  rowId: string,
  payload: { passcode: string; startMs?: number; endMs?: number; values?: Partial<DetailRowValues> },
  options: ApiClientOptions = {},
): Promise<DetailRow> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/details/${rowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DetailRow;
}

export async function deleteDetailRow(
  filmId: string,
  rowId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/details/${rowId}?passcode=${encodeURIComponent(passcode)}`, {
    method: 'DELETE',
  });
  await throwOnError(res);
}

export async function addColumn(
  filmId: string,
  payload: { passcode: string; name: string },
  options: ApiClientOptions = {},
): Promise<ColumnDoc> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as ColumnDoc;
}

// ---- Discovery agent passes -----------------------------------------------------

export interface CreateDiscoveryJobPayload {
  passcode: string;
  agentNumber?: number;
  name?: string;
  specialInstruction: string;
  targetColumns: string[];
  testMode: boolean;
}

export async function createDiscoveryJob(
  filmId: string,
  payload: CreateDiscoveryJobPayload,
  options: ApiClientOptions = {},
): Promise<DiscoveryJob> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryJob;
}

export async function listDiscoveryJobs(
  filmId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<DiscoveryJobSummary[]> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-jobs?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as DiscoveryJobSummary[];
}

export async function getDiscoveryJob(
  filmId: string,
  jobId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<DiscoveryJob> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-jobs/${jobId}?passcode=${encodeURIComponent(passcode)}`);
  await throwOnError(res);
  return (await res.json()) as DiscoveryJob;
}

/** Streams one discovery job's status — replays history then follows live until done/error. */
export async function streamDiscoveryJob(
  filmId: string,
  jobId: string,
  passcode: string,
  onEvent: (event: DiscoveryJobStreamEvent) => void,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-jobs/${jobId}/stream?passcode=${encodeURIComponent(passcode)}`,
  );
  if (!res.ok || !res.body) return;
  await parseSSEStream<DiscoveryJobStreamEvent>(res, onEvent, (event) => event.job.status === 'done' || event.job.status === 'error');
}

export async function commentOnDiscoveryJob(
  filmId: string,
  jobId: string,
  payload: { passcode: string; comment: string },
  options: ApiClientOptions = {},
): Promise<DiscoveryJob> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/films/${filmId}/discovery-jobs/${jobId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await throwOnError(res);
  return (await res.json()) as DiscoveryJob;
}

export async function mergeDiscoveryResult(
  filmId: string,
  jobId: string,
  resultRowId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<DetailRow> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-jobs/${jobId}/results/${resultRowId}/add?passcode=${encodeURIComponent(passcode)}`,
    { method: 'POST' },
  );
  await throwOnError(res);
  return (await res.json()) as DetailRow;
}

export async function discardDiscoveryResult(
  filmId: string,
  jobId: string,
  resultRowId: string,
  passcode: string,
  options: ApiClientOptions = {},
): Promise<void> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(
    `${baseUrl}/api/films/${filmId}/discovery-jobs/${jobId}/results/${resultRowId}?passcode=${encodeURIComponent(passcode)}`,
    { method: 'DELETE' },
  );
  await throwOnError(res);
}

// ---- Bridge to Project (Research) --------------------------------------------

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
