/**
 * Canonical types for the Projects pipeline (mirrors filmTypes.ts's role).
 * See docs/adr/0025-projects-firestore-pipeline-and-tool-calling-research-chat.md.
 */

export type ProjectItemAction = 'pending' | 'accepted' | 'rejected' | 'need-research';
export type ProjectLifecycleStatus = 'draft' | 'in_progress' | 'completed' | 'abandoned';
export type ResearchRunStatus = 'queued' | 'running' | 'done' | 'error';
export type ChatSessionStatus = 'idle' | 'streaming' | 'error';

export interface Rubric {
  id: string;
  projectId: string;
  name: string;
  /** Shown to the research agent (unchanged role from researchAgent.ts's original Rubric). */
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
  score: number;
  reasoning: string;
  evidence: string;
  sources: string[];
  /** Editable annotation shown in the detail panel. */
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
  /** ISO 8601 (or YYYY-MM-DD) date the source was published — lets a reviewer judge
   * staleness themselves rather than trusting the suggestion blindly. */
  publishedDate: string;
}

export interface ProjectItem {
  id: string;
  projectId: string;
  filmId: string;
  /** FK back to the source DetailRow — closes ADR 0013's flagged schema gap. */
  detailRowId: string;
  startMs: number;
  endMs: number;
  subtitleText: string;
  /** Snapshot at import time. */
  sceneDescription: string;
  /** Snapshot of DetailRow.values.custom at import time. */
  customValues: Record<string, string>;
  action: ProjectItemAction;
  /** null until first researched. */
  importanceScore: number | null;
  scores: RubricScore[];
  summary: string | null;
  shouldTranscreate: boolean | null;
  suggestedReplacement: SuggestedReplacement | null;
  /** Additive alternative(s) alongside suggestedReplacement, never a replacement for
   * it. Present only once the Trend Agent has run for this item (a shouldTranscreate
   * item whose matched rubric was trendEligible) and found something. */
  trendSuggestions: TrendSuggestion[] | null;
  lastResearchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  country: string;
  /** Required — Film-first only, see build order §2. */
  sourceFilmId: string;
  note: string;
  status: ProjectLifecycleStatus;
  createdAt: string;
  updatedAt: string;
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

/**
 * Mirrors @google/genai's Content/Part shape directly so `session.turns` feeds
 * straight into `contents` with zero translation (same principle as Discovery's
 * ConversationTurn, generalized to carry tool-call/tool-result parts).
 */
export interface ChatPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface ChatTurn {
  role: 'user' | 'model';
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
