# UX consistency punch list

Found via a blind QA pass + an `aiux-*` design-skill review on 2026-09-07 (see
`docs/progress/20260907.md`, 18:xx entry, for how this list was produced).
Each item is a place the product applies a pattern in one spot and breaks it
in another — not a general polish wishlist. Check items off as they're fixed;
add a one-line note on how, since these came from live testing, not code
reading.

Ordered roughly by fix-cost-vs-impact, cheapest/highest-impact first.

**Status: all 8 items resolved as of 2026-09-07** — 6 fixed and shipped
(1, 2, 3, 4, 7, 8), 2 researched and closed with no change needed because
they didn't hold up against the actual code (5, 6). Every item below
records what was found, not just what was originally suspected — several
original black-box observations turned out to be testing artifacts once
checked against source, and are corrected in place rather than silently
fixed.

- [x] **1. Chat suggestion chips don't adapt to whether an item is open.**
  Fixed 2026-09-07 (commit `78799be`): chips now split into `ITEM_QUICK_PROMPTS`
  / `GENERAL_QUICK_PROMPTS` in `ResearchChatPanel.tsx`, keyed on `itemId`.
  The general project-level "Session" chat and an item-scoped chat render the
  identical suggestion chips ("Propose a replacement line.", "Search the web
  to check how this reads there.", etc.), but the general session has no item
  to act on. Clicking one there fails with a raw tool-error string
  (`no item is currently open in this chat — ask the user to open a specific
  detail row first`) shown in red to the user, right next to the agent's own
  correct, friendly follow-up. Principle: **Conversational UI** — "design the
  misunderstanding, not just the happy path." Fix: don't show item-scoped
  chips (or the tools behind them) when no item is open; show a different
  empty-state / chip set for the general session.

- [x] **2. The general session chat never says it has no item context.**
  Fixed 2026-09-07 (commit `78799be`): a persistent line under the session
  title now states what the session is scoped to (the line's subtitle, or
  "General project chat — ..." with what it can/can't do), always visible,
  not just surfaced after a failed tool call.
  Same root cause as #1. The agent's own reply text says "for any of the
  rubrics you see listed for **the current item**" inside a chat that has no
  current item — nothing in the UI flags that this chat is scoped
  differently from an item-level one until a tool call fails. Principle:
  **Context Switching** — "make the active context impossible to miss."
  Fix: a persistent, visible indicator in the chat header/empty-state saying
  what (if anything) this session is scoped to.

- [x] **3. Verdicts can be set from the table without ever seeing the evidence.**
  Fixed 2026-09-07 (commit `b2bbf82`). Correction to the original write-up:
  code research before implementing found the row was already fully
  clickable-to-open (`ProjectPanel.tsx`'s `<tr onClick={() => setOpenItemId(...)}>`,
  present since Aug 30) — the earlier "only the AI Assessment pill opens
  detail" observation was a live-testing artifact, not real. The actual,
  confirmed root cause: the table shared `DetailsTable.tsx`'s `.details-table`
  CSS class but never got its `<colgroup>`/`useResizableColumns`/`ResizableTh`
  treatment, so `table-layout: fixed` split all 6 columns evenly (~68px each)
  with no tooltip — Subtitle/AI-assessment were unreadable in place. Fixed by
  giving the table real per-column widths (Subtitle 320px) via the same
  resizable-column convention `DetailsTable.tsx` and `DiscoveryChatPanel`'s
  results modal already use, plus a `title` tooltip on every truncated cell
  (the AI-assessment cell's tooltip shows the full executive reasoning, not
  just the "needs change" badge). Principle: **Human-in-the-Loop** —
  "approving has to cost something to mean something."

- [x] **4. "Your Verdict" and "AI Assessment" are two overlapping status
  fields with unrelated vocabularies and no stated relationship.**
  Fixed 2026-09-07 (commit `b2bbf82`), bundled with #3 since both touch the
  same table headers. Added an info-icon tooltip on each of the "AI
  assessment" and "Your Verdict" column headers (new shared `ColInfoIcon.tsx`,
  extracted from `DetailsTable.tsx` which had its own private copy) stating
  what each field means and that setting one doesn't change the other — a
  lightweight clarification rather than merging the fields, since they're
  legitimately different things (the agent's read vs. your decision) once
  named as such. Principle: **Explainable AI** — "show the real drivers" /
  give the user enough to act on, not a bare label.

- [x] **5. Discovery (film-level) and Research (project-level) runs get very
  different status treatment for comparable work.** — **Did not hold up;
  no change made (2026-09-07).**
  Original claim (from black-box testing) was that Research runs show
  nothing while running. Code research found this false: `ResearchRunCard`
  in `ResearchChatPanel.tsx` renders `isRunning && <p className="results-status"
  role="status">{completedBatches}/{totalBatches} batches complete…</p>`,
  the exact same `.results-status` class (pulsing accent dot via
  `animation: pulse`) that `DiscoveryRunCard` in `DiscoveryChatPanel.tsx`
  uses for its own "Working…" text — and Research's version is actually
  *more* informative (a live batch count vs. Discovery's plain "Working…").
  The session-library-list badges and the Agent Status tab
  (`FilmAgentsTab.tsx`) fold Discovery and Research rows into one `rows`
  list and render both through the identical `status-badge`/
  `status-dot--running` classes via one shared `combinedAgentStatus()` util
  — confirmed by reading the code, not assumed. The one real asymmetry is
  that film import additionally gets a one-time, full-screen hero
  (`FilmPreparingView.tsx`) before any workspace exists to show ambient
  status in — which the aiux principle's own wording ("match the tier to
  the stakes, not to the event") argues is the *correct* call, not an
  inconsistency: there's nothing else on screen to look at yet, unlike a
  Research run kicked off from inside an already-open workspace. Closing
  this without a change — the earlier finding was a testing-timing miss
  (likely caught between an already-finished mock run and the next check),
  not a real gap.

- [x] **6. Two different disclosure philosophies for similarly complex data.**
  — **Did not hold up; no change made (2026-09-07).**
  Research before implementing: the item detail's per-rubric "Show
  details" toggle already implements the aiux principle correctly —
  score + short reasoning are always visible (the necessary part), evidence
  + sources are hidden behind one click (the "rare, for the curious" part),
  exactly matching "hide the rare, never the necessary" and "cap the depth
  at two layers." The New Project wizard is a genuinely different task
  shape (ordered, dependent inputs: country before rubrics) where a
  multi-step wizard is the *correct* pattern per aiux-guided-learning's own
  "start simple, gradually introduce complexity." Forcing these two
  independently-correct patterns into one shared "philosophy" would make at
  least one of them worse, not more consistent — closing without a change.

- [x] **7. Rubric scores have two editors (chat tool + manual "Edit score")
  with no ownership indicator.**
  Fixed 2026-09-07 (commit `6f6fd51`). Research found the data already
  existed: every score write is tagged `updatedBy: 'batch-agent' |
  'chat-agent' | 'user'` in the store (`projectItemStore.ts`,
  `researchChatAgent.ts`, `routes/projects.ts`), just never rendered.
  Added "· set by you / chat agent / research pass" next to each rubric's
  weight badge in `ProjectItemView.tsx`, with the full timestamp as a hover
  tooltip. Verified against real data: the one rubric I'd edited via chat
  during items 1-2 testing correctly showed "set by chat agent" while its
  untouched siblings showed "set by research pass."

- [x] **8. Autonomy defaults are high at the two most expensive moments,
  manual everywhere else.**
  Fixed 2026-09-07 (commit `d0e765b`). Research surfaced a sharper version
  of this than the original framing: `NewProjectModal.tsx`'s "Kick off
  agentic research on project creation?" checkbox doesn't just start a
  research run — per its own code comment, it's the one path in the app
  where results skip the accept/discard review step every other run goes
  through, and that consequence was disclosed only in a source comment, not
  in the UI. Added a one-line hint under both this checkbox and
  `ImportFilmForm.tsx`'s Discovery-agent checkbox stating what actually
  happens in each state (checked/unchecked), so consent is informed at the
  point of the decision per aiux-autonomy-spectrum, without changing either
  default — unchecking either would make a fresh import/project look empty
  and broken for a demo, which is a worse outcome than a well-disclosed
  default.

## Also noted, not part of the consistency list above

- CORS console error during real (non-test-mode) video upload against GCS
  (`storage.googleapis.com/upload/...` blocked, no `Access-Control-Allow-Origin`).
  Playback still worked in testing, so not confirmed fatal, but worth checking
  the bucket's CORS config for the dev origin before relying on real network
  conditions at a demo venue.
