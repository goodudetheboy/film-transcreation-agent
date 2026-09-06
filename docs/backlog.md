# Backlog

Living checklist of triaged feedback, grouped into phases and worked roughly
top-to-bottom. Not a replacement for `docs/progress/` — check items off here
as they land, but the "what changed and why" narrative for each still goes in
that day's progress file. When a phase starts, link its progress-log entry
next to the item.

Triaged 2026-09-05 from a single batch of user feedback (see
[docs/progress/20260905.md](progress/20260905.md)).

## Phase 0 — answered, no work needed

- [x] Multi-agent kickoff — each Agent is one persistent thread; several
  Agents' Runs can be in flight concurrently (Discovery queued sequentially
  via `discoveryQueueWorker.ts`, Research runs inline/concurrently per
  ADR-0025), but there's no cross-agent orchestration. Revisit if more than
  that is wanted.

## Phase 1 — real bugs (fix first) — done 2026-09-05

- [x] Discovery "Working" status doesn't update until the window is reloaded
  once a run finishes
- [x] Default research-agent kickoff is broken (doesn't actually kick off)
  and, separately, the agent it starts should show up in the session panel
  (small residual nuance: opening the session in the same tick it's created
  can show the empty kickoff form for a moment before the run's logged —
  fixed by a reopen/reload; see [docs/progress/20260905.md](progress/20260905.md))
- [x] Agent context/staleness cluster (one root cause, several symptoms) —
  flagged as a known risk in
  [ADR-0025's Consequences](adr/0025-projects-firestore-pipeline-and-tool-calling-research-chat.md),
  closed by [ADR-0027](adr/0027-chat-agent-context-freshness.md):
  - agent edits/adds the wrong row instead of the one the user meant
    ("update row 04:08–04:10" → agent can't resolve it, adds new candidates
    instead)
  - agent insists a deleted rubric still exists ("CURRENT ITEM" context is
    stale)
  - agent can't edit custom fields (e.g. a "Food" column) — tool schemas
    (`edit_detail_row`, `update_rubric_score`) only cover a fixed field list

## Phase 2 — quick, low-risk wins — done 2026-09-05

- [x] Agent name shown in the chatbot window title; renameable
- [x] Project-creation "selected details" table: select-all checkbox, show
  all columns
- [x] Default rubrics generator (quick pass, equal weights) — real rubric
  design to follow later
- [x] Rename "Verdict"/"Action" → "AI assessment"/"Your Verdict"

## Phase 3 — chat UX — done 2026-09-05

- [x] Markdown rendering in chat bubbles
- [x] User's own bubble appears immediately on send, not after the response
  completes
- [x] Stop-generation button (true backend cancellation, not just client
  rendering — see [docs/progress/20260905.md](progress/20260905.md))
- [x] New-agent-run kickoff moves to a modal instead of cluttering the chat
  thread

## Phase 4 — Run/Details UI overhaul — done 2026-09-06

- [x] Completed Run shows a count badge ("N details found") instead of
  dumping everything into the chat; clicking opens a modal with the
  discovered details, add/delete, and a leftmost select-all-the-way
  bulk-action checkbox column (bulk add/discard via new backend endpoints,
  not a client-side loop — see [docs/progress/20260906.md](progress/20260906.md))
- [x] Clicking a details-table row opens in-panel (like Project Details),
  not a modal

## Phase 5 — self-contained polish — done 2026-09-06

- [x] Upload flow: sequence the animations instead of jumping straight to
  animation 3 of 5 — video+progress-bar animation, then SRT upload
  animation, then (if applicable) the 3rd/4th/5th, each playing at least 5s
  (shipped with a 3s floor per user direction, not the originally-triaged
  5s — see [docs/progress/20260906.md](progress/20260906.md))

## Phase 6 — needs user input before building

- [ ] "Agents" tab: dashboard of long-running tasks (Discovery/Research
  kickoffs only, not plain chat), explicit enough to know where to pick back
  up, clicking navigates straight to where the agent was called from — ties
  into the Phase 1 session-panel fix
- [ ] Backfill flow: user adds a new column (e.g. "Food") on existing
  details and wants to kick off Discover against already-existing rows to
  populate it, not just find new lines — needs UX discussion first. Video-sight
  primitive (`describe_video_segment` tool, `videoSegmentDescriber.ts`) now
  exists as groundwork — see
  [docs/progress/20260906.md](progress/20260906.md)'s 19:05 entry — still
  needs the row-selection UI, job-mode fork, and review-queue design discussed
  there before this can be built.
- [ ] Drag-and-drop a details/project-details row into an open chat compose
  box to reference it
- [ ] Visual flair (sparkle/flash) where an agent edits something live —
  "let's talk more about this"
- [ ] Project detail view redesign (font size, layout/scannability) —
  **blocked on user's draft**
- [ ] Rubrics editor redesign + color the "Your Verdict"/Action button
  instead of the AI-assessment/Verdict one — **blocked on user's Miro**
