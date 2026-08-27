/**
 * Mirrors ProjectItem/Project/researchAgent types in backend/src/services/projectStore.ts
 * and researchAgent.ts, and ResearchStreamEvent in backend/src/routes/projects.ts. Not
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

/** Mirrors Film/FilmDetail in backend/src/services/filmStore.ts. Mocked "Discovery" —
 * every film gets the same canned details regardless of the submitted script/video. */
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

/** Mirrors DialogueLine in backend/src/services/captioningClient.ts. */
export interface DialogueLine {
  timecode: string;
  character: string;
  text: string;
}

/** Mirrors GestureLog in backend/src/services/captioningClient.ts. */
export interface GestureLog {
  timecode: string;
  character: string;
  gesture: string;
  expression: string;
  narrativeLoad: string;
  backgroundNote: string;
}
