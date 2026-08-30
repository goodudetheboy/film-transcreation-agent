import type { SubtitleEntry } from './filmTypes.js';

/**
 * Derives display text for a freeform [startMs, endMs) range (see docs/adr/0023) by
 * joining every subtitle entry that overlaps it, in chronological order. A range with
 * no dialogue in it (a visual gag, a silent beat) legitimately derives ''.
 */
export function subtitleTextForRange(entries: SubtitleEntry[], startMs: number, endMs: number): string {
  return entries
    .filter((e) => e.startMs < endMs && e.endMs > startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((e) => e.text)
    .join(' ');
}
