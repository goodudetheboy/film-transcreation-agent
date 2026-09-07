import type { ProjectItemAction } from '../api/apiClient.types';

/** Matches the same semantic colors used elsewhere for these action values
 * (see .status-badge--accepted/rejected/need-research, .details-table__row--pending,
 * and the scrub bar's Details-track block coloring in VideoScrubber.tsx). Shared by
 * ProjectItemView's "Your verdict" select and ProjectPanel's items-table
 * action-picker so both surfaces color a verdict identically. */
export function actionColor(action: ProjectItemAction): string {
  if (action === 'accepted') return 'var(--success)';
  if (action === 'rejected') return 'var(--danger)';
  if (action === 'need-research') return 'var(--accent)';
  return 'var(--warning)';
}
