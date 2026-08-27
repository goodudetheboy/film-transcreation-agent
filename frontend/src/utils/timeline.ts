import type { DialogueLine, GestureLog } from '../api/apiClient.types';

export type TimelineEntry =
  | { kind: 'dialogue'; data: DialogueLine }
  | { kind: 'gesture'; data: GestureLog };

/** "HH:MM:SS" or "MM:SS" -> total seconds, for chronological sorting. */
export function timecodeToSeconds(timecode: string): number {
  return timecode
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}

/** Interleaves dialogue and gesture logs into one chronological timeline. */
export function buildTimeline(dialogue: DialogueLine[], gestures: GestureLog[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...dialogue.map((data): TimelineEntry => ({ kind: 'dialogue', data })),
    ...gestures.map((data): TimelineEntry => ({ kind: 'gesture', data })),
  ];
  return entries.sort((a, b) => timecodeToSeconds(a.data.timecode) - timecodeToSeconds(b.data.timecode));
}
