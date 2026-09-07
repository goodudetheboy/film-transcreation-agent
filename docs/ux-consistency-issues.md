# UX consistency punch list

Found via a blind QA pass + an `aiux-*` design-skill review on 2026-09-07 (see
`docs/progress/20260907.md`, 18:xx entry, for how this list was produced).
Each item is a place the product applies a pattern in one spot and breaks it
in another — not a general polish wishlist. Check items off as they're fixed;
add a one-line note on how, since these came from live testing, not code
reading.

Ordered roughly by fix-cost-vs-impact, cheapest/highest-impact first.

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

- [ ] **5. Discovery (film-level) and Research (project-level) runs get very
  different status treatment for comparable work.**
  Film import shows a full-screen animated hero with a labeled stepper
  (video → subtitle → discovery → finalize → ready). A project's Research
  run — comparably long AI work — only ever shows as a small "done" dot in a
  session list, nothing shown while it's actually running. Principle:
  **Agent Status & Monitoring** — "match the tier to the stakes, not to the
  event." Fix: give Research runs an equivalent lightweight in-progress
  indicator (doesn't need the full hero treatment, just *something* live).

- [ ] **6. Two different disclosure philosophies for similarly complex data.**
  New Project uses an explicit 4-step wizard (Project Info → Selected Details
  → Rubrics → Confirmation). The Item Detail view, showing comparably dense
  data (reasoning, suggested change, 6 rubric scores), instead shows
  everything at once with individual per-rubric "Show details" toggles.
  Principle: **Progressive Disclosure** — pick one philosophy and apply it
  consistently to "is this a step or an inline expand."

- [ ] **7. Rubric scores have two editors (chat tool + manual "Edit score")
  with no ownership indicator.**
  `update_rubric_score` (chat) and the inline "Edit score" button write to
  the same field, and nothing shows who last touched it or warns if the agent
  might overwrite a manual edit on its next run. Principle: **Mixed-Initiative
  Control** — "one owner per region, and show it." Fix: a small "edited by
  you" / "set by agent" label near the score, or a timestamp + source.

- [ ] **8. Autonomy defaults are high at the two most expensive moments,
  manual everywhere else.**
  "Run Discovery agent on import" and "Kick off agentic research on project
  creation" both default to checked — full auto-run at video captioning and
  the research pass, the two priciest operations. Everywhere else (inside an
  item) nothing happens without an explicit chat message or click. Principle:
  **Autonomy Spectrum** — "default low, earn the rest." Not necessarily wrong
  for a demo tool, but worth a deliberate decision rather than an accident of
  what got built first.

## Also noted, not part of the consistency list above

- CORS console error during real (non-test-mode) video upload against GCS
  (`storage.googleapis.com/upload/...` blocked, no `Access-Control-Allow-Origin`).
  Playback still worked in testing, so not confirmed fatal, but worth checking
  the bucket's CORS config for the dev origin before relying on real network
  conditions at a demo venue.
