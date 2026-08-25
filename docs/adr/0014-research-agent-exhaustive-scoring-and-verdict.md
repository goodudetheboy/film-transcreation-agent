# 0014. Research agent: exhaustive per-rubric scoring, verdict, and suggested replacement

Status: Accepted (supersedes 0012's "evidence-gathering only" scope)

## Context

0012 deliberately scoped Research to evidence-gathering only: for each item, decide which rubrics
plausibly apply, gather web evidence for those, and report a reason/evidence/change-direction —
explicitly "no ranking or fix," reserving cross-item ranking for a not-yet-built Prioritization
stage and fix proposals for a not-yet-built Proposal stage.

The product owner asked for something different: given a project's rubrics (say 5 of them), every
detail should be **scored against every rubric** (0–10, exhaustive, no skipping), with the score and
reasoning shown per rubric. Then, synthesized across all of an item's scores, a **summary verdict**
— should this item be transcreated, and why. If yes, **one suggested replacement** with
justification.

Confirmed via clarifying questions before implementation:
- **Score meaning**: relevance/match-strength between the item and what the rubric describes — "the
  higher the score the more it matches the rubric," not a "how well would this land" fit score.
  Since the existing default rubrics are all risk descriptions (e.g. `food-aversion`), a high score
  functions in practice as a strong risk signal.
- **Scoring scope**: exhaustive. Every item × every rubric, always — even an obviously-inapplicable
  rubric still gets an entry, with a low score and a short reasoning saying why it doesn't apply.
- **Web search**: lazy/selective, not exhaustive. The model should only spend a real Parallel Web
  Search call when genuinely uncertain, reasoning from general knowledge otherwise. Exhaustive
  scoring makes this a real cost concern: a 15-item × 5-rubric project is 75 scores; always
  searching all 75 would be slow and expensive.

## Decision

`ResearchResult` changes from a variable-length, sometimes-empty `findings: RubricFinding[]` to:

```ts
export interface RubricScore {
  rubricId: string;
  score: number;        // 0-10 integer
  reasoning: string;
  evidence: string;
  sources: string[];    // empty when no search was performed for this rubric-item pair
}

export interface SuggestedReplacement {
  text: string;
  justification: string;
}

export interface ResearchResult {
  itemId: string;
  targetCountry: string;
  scores: RubricScore[];               // always exactly one entry per project rubric
  summary: string;                      // synthesis across all scores, not a re-listing
  shouldTranscreate: boolean;
  suggestedReplacement?: SuggestedReplacement;  // present only when shouldTranscreate
}
```

`shouldTranscreate` and `summary` are **model-emitted judgments**, not a backend-computed threshold
(e.g. not `scores.some(s => s.score >= 7)`). The request asks for a synthesized verdict across the
whole picture, not a fixed cutoff — a threshold would be more deterministic/auditable but loses that
synthesis.

The prompt trades exhaustive scoring against lazy search explicitly: it instructs the model to
search only when genuinely uncertain about a specific reference, food, gesture, or joke, and to
score confidently from general knowledge otherwise, leaving `sources` empty in that case. This is an
accuracy/cost tradeoff, not free — a rubric scored from general knowledge alone could in principle be
wrong in a way that a search would have caught.

Downstream, `POST /api/projects/:id/research`'s `done` event summary changes from `totalFindings`
(a count of findings) to `totalRecommendedForChange` (a count of items where `shouldTranscreate` is
true) — the more directly useful "how many did this run flag" headline number for a triage tool.

## Consequences

- **Prioritization's future scope is narrower.** Cross-item ranking may now reduce largely to
  sorting by `shouldTranscreate` + score magnitude, though a real Prioritization stage may still add
  value (e.g. weighting rubrics differently, deciding how many items a human should review first).
  Worth revisiting when that stage is actually built, not resolved by this ADR.
- **Proposal's future scope is largely absorbed into `suggestedReplacement`.** A dedicated Proposal
  stage may no longer be needed, or may become "refine/expand on Research's single suggestion"
  rather than "generate the first suggestion." Also worth revisiting, not resolved here.
- **Output size per Gemini call grows substantially** — roughly 3-5x the old sparse/selective
  findings design (10 items × 5 rubrics of structured output, vs. a variable, often-empty findings
  list). `BATCH_SIZE` stays at 10 for now; this is an open risk, not yet observed to be a problem in
  testing (unit tests and one live real-API run all parsed cleanly), but if invalid-JSON or
  truncated-output errors start appearing in practice, the fix is lowering `BATCH_SIZE` or setting an
  explicit `maxOutputTokens` — both easy, deliberately deferred until there's evidence they're
  needed.
- Every downstream consumer of `ResearchResult` needed updating in lockstep: `mockResearchAgent.ts`
  (now actually consumes the `rubrics` param it previously ignored), `projects.ts`'s SSE summary,
  the mirrored frontend types in `apiClient.types.ts`, and `ProjectDetailView.tsx`'s rendering (new
  verdict block, suggested-replacement block, per-rubric score list with color-tiered scores).
  `projectStore.ts` (backend and frontend) needed no changes — both are pure pass-throughs of
  `ResearchResult`.
