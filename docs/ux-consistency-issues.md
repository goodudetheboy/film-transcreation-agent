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

- [ ] **3. Verdicts can be set from the table without ever seeing the evidence.**
  The Items table lets you flip "Your Verdict" (pending/accepted/rejected/
  need-research) directly from a row where Subtitle and AI Assessment are
  truncated to a fixed ~68px column with no tooltip and no way to preview.
  Principle: **Human-in-the-Loop** — "approving has to cost something to mean
  something." Fix: widen the truncated columns, add a hover tooltip with full
  text, or make the row itself open the detail panel on click, so a verdict
  can't be set without the reviewer having seen what they're ruling on.

- [ ] **4. "Your Verdict" and "AI Assessment" are two overlapping status
  fields with unrelated vocabularies and no stated relationship.**
  Verdict: pending/accepted/rejected/need-research. AI Assessment:
  not-assessed/fine-as-is/needs-change. Both are human-editable, both read as
  "the status of this item," and nothing in the UI explains how (or whether)
  one should follow from the other. Fix: either merge them, or add a short
  inline explanation of what each one is *for* (e.g. "AI Assessment: the
  agent's read. Your Verdict: your decision.").

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
