import type { FilmStatus, ProjectLifecycleStatus, ResearchRunStatus } from '../api/apiClient.types';

/** Humanized display text for every raw status/lifecycle enum shown as a
 * `.status-badge` across the app — one shared source so a project's stage
 * (say) doesn't read "In progress" on one tile and the literal `in_progress`
 * on another. */

export const FILM_STATUS_LABELS: Record<FilmStatus, string> = {
  processing: 'Processing…',
  processed: 'Processed',
};

export const PROJECT_STAGE_LABELS: Record<ProjectLifecycleStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

/** Covers both `ResearchRunStatus` itself and the narrower 'running'|'done'|'error'
 * shape `combinedAgentStatus()` returns — that union is a subset of this one's keys. */
export const AGENT_RUN_LABELS: Record<ResearchRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  error: 'Error',
};
