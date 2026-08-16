/**
 * Mirrors AgentEvent/FlaggedLine in proxy/src/routes/analyze.ts and
 * proxy/src/services/dialogflowClient.ts. Not literally shared via a workspace
 * package (kept dead-simple for the hackathon scaffold, per docs/adr/0006) — if
 * this shape changes, update both sides by hand.
 */
export interface FlaggedLine {
  line: string;
  reason: string;
  suggestedReplacement: string;
  [key: string]: unknown;
}

export type AgentEvent =
  | { type: 'progress'; message: string }
  | { type: 'line_flagged'; line: FlaggedLine }
  | { type: 'done'; summary: { totalFlagged: number } }
  | { type: 'error'; message: string };
