import type { DetailRow } from './filmTypes.js';

/**
 * Replaces preprocessingToItems.ts now that a film's line-items come from the
 * curated Details table (detailRows) instead of raw Discover Agent
 * dialogue/gesture output — the human has already decided what's worth
 * sending to Research by the time rows exist here. Rows are already in
 * chronological creation order per detailRowsStore.ts's `orderBy('createdAt')`.
 */
export function detailRowsToProjectItems(
  rows: DetailRow[],
): Array<{ scriptLine: string; sceneDescription: string }> {
  return rows.map((row) => ({
    scriptLine: row.subtitleText,
    sceneDescription: row.values.segmentDescription || row.values.gesture || row.values.notes || '',
  }));
}
