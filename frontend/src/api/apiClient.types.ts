/**
 * Mirrors ProjectItem/Project/researchAgent types in backend/src/services/projectStore.ts
 * and researchAgent.ts, ResearchStreamEvent in backend/src/routes/projects.ts, and
 * Film/SubtitleEntry/DetailRow/DiscoveryJob in backend/src/services/filmTypes.ts. Not
 * literally shared via a workspace package (kept dead-simple for the hackathon
 * scaffold, per docs/adr/0006) — if this shape changes, update both sides by hand.
 */
export interface Rubric {
  id: string;
  description: string;
}

export interface RubricScore {
  rubricId: string;
  /** 0-10 integer. Relevance/match-strength between the item and the concern this
   * rubric describes — NOT a "how well would this land" fit score. */
  score: number;
  reasoning: string;
  evidence: string;
  sources: string[];
}

export interface SuggestedReplacement {
  text: string;
  justification: string;
}

export interface ResearchResult {
  itemId: string;
  targetCountry: string;
  /** Always exactly one entry per project rubric, in rubric order — exhaustive. */
  scores: RubricScore[];
  /** Synthesis across all scores, not a re-listing. */
  summary: string;
  shouldTranscreate: boolean;
  /** Present only when shouldTranscreate is true. */
  suggestedReplacement?: SuggestedReplacement;
}

export interface ProjectItem {
  id: string;
  scriptLine: string;
  sceneDescription: string;
}

export type BatchStatus = 'pending' | 'running' | 'done' | 'error';

export interface ProjectBatch {
  index: number;
  itemIds: string[];
  status: BatchStatus;
}

export type ProjectStatus = 'draft' | 'researching' | 'done' | 'error';

export interface Project {
  id: string;
  name: string;
  country: string;
  items: ProjectItem[];
  rubrics: Rubric[];
  status: ProjectStatus;
  batches: ProjectBatch[];
  results: ResearchResult[];
  errorMessage?: string;
  createdAt: string;
}

export type ResearchStreamEvent =
  | { type: 'progress'; message: string }
  | {
      type: 'batch_done';
      batchIndex: number;
      totalBatches: number;
      itemIds: string[];
      results: ResearchResult[];
    }
  | { type: 'done'; summary: { totalItems: number; totalRecommendedForChange: number } }
  | { type: 'error'; message: string };

// ---- Films / subtitle / details / discovery jobs (docs/adr/0018-0022) --------------

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

export type FilmPrepStreamEvent = { type: 'prep_update'; prep: FilmPrep };

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

/** Full job detail, as returned by GET .../discovery-jobs/:jobId and the stream. */
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
  commentHistory: Array<{ ts: string; comment: string }>;
  errorMessage?: string;
}

/** Lightweight shape from the list endpoint — no log/resultRows/commentHistory. */
export type DiscoveryJobSummary = Pick<
  DiscoveryJob,
  | 'id'
  | 'filmId'
  | 'agentNumber'
  | 'passNumber'
  | 'name'
  | 'specialInstruction'
  | 'targetColumns'
  | 'status'
  | 'testMode'
  | 'createdAt'
  | 'startedAt'
  | 'finishedAt'
  | 'updatedAt'
  | 'errorMessage'
>;

export type DiscoveryJobStreamEvent = { type: 'job_update'; job: DiscoveryJob };
