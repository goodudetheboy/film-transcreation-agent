/**
 * Mock "Discovery" output for the demo Film — 15 candidate details for Pixar's
 * Inside Out (2015), targeting Japan-style localization triage.
 *
 * These are ORIGINAL scene-description paraphrases based on the film's widely
 * publicized, publicly-documented plot elements (character designs, setting,
 * well-known scenes) — not excerpts from the actual screenplay. `scriptLine` is
 * left empty for visual-only candidates, matching the schema's own convention
 * (see docs/adr/0012's prompt spec). The one exception is the broccoli line,
 * which mirrors the same short paraphrase used in mockResearchAgent.ts for the
 * same real, widely-reported case: Pixar swapped broccoli for green peppers in
 * the Japanese release.
 */
export interface FixtureDetail {
  scriptLine: string;
  sceneDescription: string;
}

export const INSIDE_OUT_DETAILS: FixtureDetail[] = [
  {
    scriptLine: "I'm not eating that broccoli.",
    sceneDescription: 'At the family dinner table, Riley pushes a plate of broccoli away in disgust.',
  },
  {
    scriptLine: '',
    sceneDescription: 'Riley tries out for a local ice hockey team at an indoor rink, wearing pads and skates.',
  },
  {
    scriptLine: '',
    sceneDescription:
      'A moving truck pulls away from a snowy Minnesota house as the family drives toward a new home in San Francisco.',
  },
  {
    scriptLine: '',
    sceneDescription:
      'Tall glowing landmasses representing different parts of a personality are shown connected by bridges to a central control room.',
  },
  {
    scriptLine: '',
    sceneDescription:
      'An imaginary childhood friend made of cotton-candy-like fluff, part elephant and part cat, cries actual candy out of his eyes when sad.',
  },
  {
    scriptLine: '',
    sceneDescription:
      'Glowing golden spheres representing especially important memories are stored on shelves and periodically sent to power a central console.',
  },
  {
    scriptLine: '',
    sceneDescription: 'A blue-skinned character touches a golden memory sphere, and the memory inside turns from gold to blue.',
  },
  {
    scriptLine: '',
    sceneDescription:
      "A film-studio set built inside a character's mind produces her dreams each night, complete with a director's chair and a studio sign.",
  },
  {
    scriptLine: '',
    sceneDescription: "A short, red, block-shaped character's flat-topped head bursts into flame whenever he loses his temper.",
  },
  {
    scriptLine: '',
    sceneDescription:
      'A tall, nervous purple character reads off a long list of region-specific dangers, including earthquakes, to worry about in the new city.',
  },
  {
    scriptLine: '',
    sceneDescription:
      "A child takes a bank card from her mother's wallet without asking and uses it to buy a bus ticket back to her old hometown.",
  },
  {
    scriptLine: '',
    sceneDescription:
      "Two characters are broken down piece by piece into flat geometric shapes while crossing a hallway representing 'abstract thought'.",
  },
  {
    scriptLine: '',
    sceneDescription:
      'A young girl briefly imagines a dramatic, movie-style romance with a boy from her class, complete with a rescue from a burning building.',
  },
  {
    scriptLine: '',
    sceneDescription: "One of the characters briefly imagines the girl's father as a caped superhero to cheer herself up.",
  },
  {
    scriptLine: '',
    sceneDescription:
      "A brightly colored island shaped like a giant trampoline represents a silly, goofy side of the personality, with a clown-like structure at its center.",
  },
];
