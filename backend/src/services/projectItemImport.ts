import type { DetailRow } from './filmTypes.js';
import type { CreateProjectItemInput } from './projectItemStore.js';

/**
 * Replaces detailRowsToProjectItems.ts now that project creation is
 * always Film-first and explicit-selection-only (never "every DetailRow
 * unconditionally", see docs/adr/0025). Only ever called for a caller-chosen
 * subset of a film's DetailRows — the human has already decided what's worth
 * sending to Research by the time this runs, same as its predecessor, but now
 * preserves startMs/endMs/custom column values and the FK back to the source
 * DetailRow instead of flattening them away.
 */
export function detailRowsToProjectItemInputs(filmId: string, rows: DetailRow[]): CreateProjectItemInput[] {
  return rows.map((row) => ({
    filmId,
    detailRowId: row.id,
    startMs: row.startMs,
    endMs: row.endMs,
    subtitleText: row.subtitleText,
    sceneDescription: row.values.segmentDescription || row.values.gesture || row.values.notes || '',
    customValues: row.values.custom,
  }));
}
