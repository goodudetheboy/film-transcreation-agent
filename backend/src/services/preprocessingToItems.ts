import type { FilmPreprocessing } from './filmStore.js';

/** "HH:MM:SS" or "MM:SS" -> total seconds, for chronological sorting. Mirrors
 * frontend/src/utils/timeline.ts's timecodeToSeconds. */
function timecodeToSeconds(timecode: string): number {
  return timecode
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}

/**
 * Converts Discover Agent output (dialogue + gestures) into the project item shape
 * (scriptLine + sceneDescription), interleaved chronologically by timecode — this is
 * what a project's line items are built from once a film has been through Discover
 * Agent, replacing the earlier mocked `FilmDetail` fixture data.
 */
export function preprocessingToItems(
  preprocessing: FilmPreprocessing,
): Array<{ scriptLine: string; sceneDescription: string }> {
  type Entry = { timecode: string; item: { scriptLine: string; sceneDescription: string } };

  const entries: Entry[] = [
    ...preprocessing.dialogue.map(
      (d): Entry => ({
        timecode: d.timecode,
        item: { scriptLine: d.text, sceneDescription: `${d.character} speaking` },
      }),
    ),
    ...preprocessing.gestures.map((g): Entry => {
      const description = [g.gesture, g.expression].filter(Boolean).join(', ');
      return {
        timecode: g.timecode,
        item: {
          scriptLine: '',
          sceneDescription: description || `${g.character}, no notable gesture`,
        },
      };
    }),
  ];

  return entries
    .sort((a, b) => timecodeToSeconds(a.timecode) - timecodeToSeconds(b.timecode))
    .map((e) => e.item);
}
