import type { CreateRubricInput } from '../services/projectRubricStore.js';

/**
 * Placeholder rubric list — the real rubric set isn't decided yet (see the Research
 * agent handoff). This is only a convenience default for creating a project without
 * specifying rubrics explicitly (a project's real Rubric docs are created via
 * projectRubricStore.createRubric for each entry here); researchAgent.ts itself
 * never hardcodes rubrics.
 */
export const DEFAULT_RUBRICS: CreateRubricInput[] = [
  {
    name: 'Food aversion',
    description: 'A food or drink reference that reads differently (or not at all) in the target country.',
    weight: 3,
  },
  {
    name: 'Wordplay',
    description: 'A pun, rhyme, or wordplay joke that depends on the source language and will not survive translation.',
    weight: 3,
  },
  {
    name: 'Gesture',
    description: 'A hand gesture, body language, or physical action with a different or offensive meaning in the target country.',
    weight: 3,
  },
  {
    name: 'Holiday reference',
    description: 'A holiday, season, or calendar-based reference not observed the same way in the target country.',
    weight: 3,
  },
  {
    name: 'Cultural institution',
    description: 'A reference to an institution, brand, or shared cultural experience specific to the source country.',
    weight: 3,
  },
];
