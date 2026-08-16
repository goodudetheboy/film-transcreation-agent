import type { DialogflowClient, FlaggedLine } from './dialogflowClient.js';

/**
 * Canned response for local dev/demoing without Google Cloud credentials or
 * live API cost. Content mirrors documented real localization cases (Pixar's
 * Inside Out broccoli swap, US-specific institutional references) rather than
 * inventing scenarios — see docs/product/pitch.md.
 */
const MOCK_FLAGGED_LINES: FlaggedLine[] = [
  {
    line: "I'm not eating that broccoli.",
    reason:
      'Broccoli reads as a disliked vegetable to American kids, but not to Japanese kids — the joke has no basis in the target market. (Documented case: Pixar re-animated this exact line for Inside Out\'s Japanese release, swapping in green peppers.)',
    suggestedReplacement: "I'm not eating that green pepper.",
  },
  {
    line: 'This is worse than a trip to the DMV.',
    reason:
      'The DMV is a US-specific institution with no equivalent recognized outside the US — the line depends on shared cultural annoyance that doesn\'t transfer.',
    suggestedReplacement: 'This is worse than waiting in line at city hall.',
  },
];

export function createMockDialogflowClient(): DialogflowClient {
  return {
    async analyzeScript() {
      return MOCK_FLAGGED_LINES;
    },
  };
}
