import type { Rubric } from '../services/researchAgent.js';

/**
 * Placeholder rubric list — the real rubric set isn't decided yet (see the Research
 * agent handoff). This is only a convenience default for creating a project without
 * specifying rubrics explicitly; researchAgent.ts itself never hardcodes rubrics.
 */
export const DEFAULT_RUBRICS: Rubric[] = [
  { id: 'food-aversion', description: 'A food or drink reference that reads differently (or not at all) in the target country.' },
  { id: 'wordplay', description: 'A pun, rhyme, or wordplay joke that depends on the source language and will not survive translation.' },
  { id: 'gesture', description: 'A hand gesture, body language, or physical action with a different or offensive meaning in the target country.' },
  { id: 'holiday-reference', description: 'A holiday, season, or calendar-based reference not observed the same way in the target country.' },
  { id: 'cultural-institution', description: 'A reference to an institution, brand, or shared cultural experience specific to the source country.' },
];
