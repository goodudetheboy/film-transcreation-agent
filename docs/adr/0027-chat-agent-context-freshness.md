# 0027. Chat agents: closing the context-freshness gap flagged by ADR-0025

Status: Accepted — closes part of a risk named in 0025

## Context

[ADR-0025](0025-projects-firestore-pipeline-and-tool-calling-research-chat.md)'s
Consequences section named a real, un-mitigated risk when the tool-calling chat
agents shipped: *"a chat session's tool calls are only ever as good as whatever
item the frontend says is 'currently open'... No cross-check against the
conversation's own text exists to catch that."* A batch of real user feedback
turned that predicted risk into three concrete symptoms:

1. Asking the Discovery agent to edit "row 04:08–04:10" failed — it had no
   timestamp data to match against, only `rowId`s, and no fallback tool, so it
   fabricated new candidate rows instead of finding the row the user meant.
2. The research chat agent insisted a rubric the user had deleted still existed
   with a live score, because deleting a rubric only removed the rubric
   document — nothing pruned the matching entry out of every `ProjectItem.scores`
   array, so the "stale" data was genuinely still stored, not just cached.
3. Asking the Discovery agent to edit a user-defined custom column (e.g.
   "Food") was refused — `edit_detail_row`'s tool schema only allowed
   `subtitleText`/`segmentDescription`/`gesture`/`notes`, and the underlying
   `DetailRowsStore.updateRow` merge shallow-replaced `values.custom` wholesale,
   so even a permissive tool would have silently wiped sibling custom columns.

## Decision

Three targeted fixes, not a redesign of the context-injection architecture:

- **Timestamps in context**: `discoveryChatAgent.ts`'s `buildDetailsContext` now
  includes each row's `mm:ss` start/end range alongside its `rowId`, so the
  model can resolve a time-based reference itself — no new lookup tool needed.
- **Prune on delete, not filter on read**: `DELETE /api/projects/:id/rubrics/:rubricId`
  now calls a new `ProjectItemStore.removeRubricScore(projectId, rubricId,
  remainingRubrics)`, which strips that rubric's score from every item in the
  project and recomputes `importanceScore` against the rubrics that remain.
  This is a real data-integrity fix — the orphaned score no longer exists
  anywhere, not just hidden from context-building.
- **Custom fields become a real edit target**: `buildDetailsContext` now also
  surfaces the film's defined custom columns (name/description/current value
  per row, same `columnMeta` shape `discoveryQueueWorker.ts` already builds for
  the batch agent) so the model knows a column like "Food" exists at all.
  `edit_detail_row`'s executor accepts any real column `key` in addition to the
  fixed field list. This only works because `DetailRowsStore.updateRow`'s merge
  was fixed to deep-merge `values.custom` (`{...current.custom, ...patch.custom}`)
  instead of replacing it outright — otherwise a one-field custom edit would
  have wiped every other custom column on that row.

## Consequences

- Deleting a rubric is now a heavier write (a batch across every item in the
  project) instead of touching one document — acceptable at this app's scale,
  same tradeoff already accepted elsewhere (e.g. `createItems`'s batch write).
- **What's still not fixed**: this closes the three reported symptoms, not the
  underlying architecture ADR-0025 flagged. There is still no cross-check
  between a chat message's text and the `itemId`/row the frontend says is
  "currently open" — a message sent with the wrong panel open can still mutate
  the wrong item, just as before. Custom-field editing was extended to the
  Discovery chat agent only (`edit_detail_row`), since that's where the gap was
  reported; the research chat agent's tools (`update_rubric_score`,
  `propose_replacement`) still only target their fixed field set.
- The backlog item "the agent should pick up Rubrics-tab edits next time it's
  called" is now partially satisfied for deletions specifically (the stale data
  is actually gone). Score edits/additions to a rubric already flow through
  live context-building on every turn (confirmed unaffected — context was
  already read fresh per turn, not cached) and are unaffected by this change.
