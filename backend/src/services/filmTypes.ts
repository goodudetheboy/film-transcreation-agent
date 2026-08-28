/**
 * Shared record shapes for the Firestore-backed film workspace (see
 * docs/adr/0018). Split out from filmStore.ts so detailRowsStore.ts,
 * discoveryJobStore.ts, and the discovery-agent services can share them
 * without a circular import.
 */

export interface SubtitleEntry {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface FilmSubtitle {
  fileUrl: string;
  format: 'srt' | 'vtt';
  entries: SubtitleEntry[];
}

export type FilmPrepStage =
  | 'video_uploading'
  | 'subtitle_uploading'
  | 'discovery_running'
  | 'finalizing'
  | 'ready'
  | 'error';

export interface FilmPrepLogEntry {
  ts: string;
  message: string;
}

export interface FilmPrep {
  stage: FilmPrepStage;
  videoDone: boolean;
  subtitleDone: boolean;
  discoveryJobId: string | null;
  discoveryDone: boolean;
  finalizeDone: boolean;
  log: FilmPrepLogEntry[];
  errorMessage?: string;
}

export type FilmStatus = 'processing' | 'processed';

export interface Film {
  id: string;
  title: string;
  videoUrl: string;
  subtitle: FilmSubtitle | null;
  runDiscoveryOnCreate: boolean;
  prep: FilmPrep;
  status: FilmStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFilmInput {
  title: string;
  videoUrl: string;
  subtitle: FilmSubtitle | null;
  runDiscoveryOnCreate: boolean;
}

/** The three wireframe-fixed columns — shared constants, not per-film documents. */
export const BUILTIN_COLUMN_KEYS = ['segmentDescription', 'gesture', 'notes'] as const;
export type BuiltinColumnKey = (typeof BUILTIN_COLUMN_KEYS)[number];

export const BUILTIN_COLUMN_LABELS: Record<BuiltinColumnKey, string> = {
  segmentDescription: 'Segment Description',
  gesture: 'Gesture',
  notes: 'Notes',
};

export interface ColumnDoc {
  id: string;
  filmId: string;
  name: string;
  key: string;
  createdAt: string;
}

export type DetailRowProvenance =
  | { type: 'user-marked' }
  | { type: 'agent-discovered'; jobId: string; agentNumber: number; passNumber: number }
  | { type: 'ai-assisted'; jobId: string; agentNumber: number; passNumber: number };

export interface DetailRowValues {
  segmentDescription: string;
  gesture: string;
  notes: string;
  custom: Record<string, string>;
}

export interface DetailRow {
  id: string;
  filmId: string;
  subtitleEntryId: string;
  timestamp: string;
  subtitleText: string;
  values: DetailRowValues;
  provenance: DetailRowProvenance;
  createdAt: string;
  updatedAt: string;
}

export type DiscoveryJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface DiscoveryResultRowValues {
  segmentDescription?: string;
  gesture?: string;
  notes?: string;
  custom?: Record<string, string>;
}

export interface DiscoveryResultRow {
  tempId: string;
  subtitleEntryId: string;
  timestamp: string;
  subtitleText: string;
  values: DiscoveryResultRowValues;
}

export interface ConversationTurn {
  role: 'user' | 'model';
  parts: unknown[];
}

export interface DiscoveryJob {
  id: string;
  filmId: string;
  agentNumber: number;
  passNumber: number;
  name: string | null;
  specialInstruction: string;
  targetColumns: string[];
  status: DiscoveryJobStatus;
  testMode: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  log: FilmPrepLogEntry[];
  resultRows: DiscoveryResultRow[];
  conversationHistory: ConversationTurn[];
  commentHistory: Array<{ ts: string; comment: string }>;
  errorMessage?: string;
}
