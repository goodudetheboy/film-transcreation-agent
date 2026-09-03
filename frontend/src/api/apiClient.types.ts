/**
 * Mirrors backend/src/services/projectTypes.ts (Project/Rubric/ProjectItem/
 * ResearchRun/ChatSession), backend/src/routes/projects.ts's
 * ResearchRunStreamEvent, and backend/src/services/researchChatAgent.ts's
 * ChatStreamEvent, plus Film/SubtitleEntry/DetailRow/DiscoveryJob in
 * backend/src/services/filmTypes.ts. Not literally shared via a workspace
 * package (kept dead-simple for the hackathon scaffold, per docs/adr/0006) —
 * if this shape changes, update both sides by hand. See docs/adr/0025.
 */
export type ProjectItemAction = 'pending' | 'accepted' | 'rejected' | 'need-research';
export type ProjectLifecycleStatus = 'draft' | 'in_progress' | 'completed' | 'abandoned';
export type ResearchRunStatus = 'queued' | 'running' | 'done' | 'error';
export type ChatSessionStatus = 'idle' | 'streaming' | 'error';

export interface Rubric {
  id: string;
  projectId: string;
  name: string;
  description: string;
  /** 1-5 importance multiplier, default 3. */
  weight: number;
  /** Whether this rubric's concern is tied to socially-current content (slang, memes,
   * viral references) that the Trend Agent should search live sources for. */
  trendEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RubricScore {
  rubricId: string;
  /** 0-10 integer. Relevance/match-strength between the item and the concern this
   * rubric describes — NOT a "how well would this land" fit score. */
  score: number;
  reasoning: string;
  evidence: string;
  sources: string[];
  userNote?: string;
  updatedAt: string;
  updatedBy: 'batch-agent' | 'chat-agent' | 'user';
}

export interface SuggestedReplacement {
  text: string;
  justification: string;
}

export interface TrendSuggestion {
  text: string;
  justification: string;
  sourceUrl: string;
  sourceTitle: string;
  /** ISO 8601 (or YYYY-MM-DD) date the source was published — used to show a staleness
   * indicator so the reviewer judges freshness themselves. */
  publishedDate: string;
}

export interface ProjectItem {
  id: string;
  projectId: string;
  filmId: string;
  detailRowId: string;
  startMs: number;
  endMs: number;
  subtitleText: string;
  sceneDescription: string;
  customValues: Record<string, string>;
  action: ProjectItemAction;
  importanceScore: number | null;
  scores: RubricScore[];
  summary: string | null;
  shouldTranscreate: boolean | null;
  suggestedReplacement: SuggestedReplacement | null;
  /** Additive alternative(s) alongside suggestedReplacement, never a replacement for
   * it. Present only once the Trend Agent has run for this item and found something. */
  trendSuggestions: TrendSuggestion[] | null;
  lastResearchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  country: string;
  sourceFilmId: string;
  note: string;
  status: ProjectLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

/** What GET /api/projects and /api/projects/:id return — Project plus server-side
 * enrichment so the Library table needs exactly one call, no frontend N+1. */
export interface EnrichedProject extends Project {
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  needResearchCount: number;
  agentStatus: ResearchRunStatus | null;
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
  /** Present only when this batch's item was routed to the Trend Agent and it found
   * something — merged in for the run's originating connection, see routes/projects.ts. */
  trendSuggestions?: TrendSuggestion[];
}

export interface ResearchRun {
  id: string;
  projectId: string;
  mode: 'need-research' | 'custom';
  itemIds: string[];
  rubricIds: string[];
  status: ResearchRunStatus;
  testMode: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  totalBatches: number;
  completedBatches: number;
  errorMessage?: string;
}

export type ResearchRunStreamEvent =
  | { type: 'progress'; message: string; runId: string }
  | {
      type: 'batch_done';
      batchIndex: number;
      totalBatches: number;
      itemIds: string[];
      results: ResearchResult[];
    }
  | { type: 'done'; summary: { totalItems: number; totalRecommendedForChange: number } }
  | { type: 'error'; message: string };

/** The resumable stream's frame shape — the entire current run document each time. */
export type ResearchRunUpdateEvent = { type: 'run_update'; run: ResearchRun };

// ---- Chat (docs/adr/0025) --------------------------------------------------

export interface ChatPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  /** A reference to a bulk ResearchRun kicked off from this session's thread — mirrors
   * DiscoveryChatPart's `run` variant. Rendered inline in the timeline as a run card. */
  run?: { runId: string };
}

export interface ChatTurn {
  role: 'user' | 'model' | 'system';
  parts: ChatPart[];
  ts: string;
}

export interface ChatSession {
  id: string;
  projectId: string;
  name: string | null;
  sessionNumber: number;
  status: ChatSessionStatus;
  turns: ChatTurn[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; result: Record<string, unknown> }
  | { type: 'item_patched'; itemId: string; rubricId?: string; patch: Record<string, unknown> }
  | { type: 'turn_done' }
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
  /** Shown as a tooltip next to the column name, and fed to the Discovery Agent as context. */
  description: string;
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
  startMs: number;
  endMs: number;
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
  startMs: number;
  endMs: number;
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

// ---- Discovery agent chat (the sidebar conversation "wrapping" DiscoveryJob passes) ----

export type DiscoveryChatSessionStatus = 'idle' | 'streaming' | 'error';

export interface DiscoveryChatPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  run?: { jobId: string };
}

export interface DiscoveryChatTurn {
  role: 'user' | 'model' | 'system';
  parts: DiscoveryChatPart[];
  ts: string;
}

/** One Agent = one persistent thread; `agentNumber` matches DiscoveryJob's field of the same name. */
export interface DiscoveryAgentSession {
  id: string;
  filmId: string;
  name: string | null;
  agentNumber: number;
  status: DiscoveryChatSessionStatus;
  turns: DiscoveryChatTurn[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export type DiscoveryChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; name: string; result: Record<string, unknown> }
  | { type: 'row_patched'; row: DetailRow }
  | { type: 'row_added'; row: DetailRow; jobId: string; tempId: string }
  | { type: 'row_discarded'; jobId: string; tempId: string }
  | { type: 'turn_done' }
  | { type: 'error'; message: string };
