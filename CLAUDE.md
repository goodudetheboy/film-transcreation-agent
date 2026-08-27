# CLAUDE.md

Cultural Resonance Agent — localization triage tool for the Agentic Cinema hackathon.
Submit a script + target country, get back a ranked list of lines unlikely to land
there, each with a reason and a suggested replacement.

## Repo map

- `frontend/` — Vite + React + TS UI
- `backend/` — thin Express relay: passcode gate, rate limit, Films → Discover Agent
  (Gemini/Vertex captioning) → Project → Research agent (Gemini + Parallel web
  grounding) pipeline. The original Dialogflow CX pipeline (Analyze tab) was removed;
  see `docs/adr/0017-remove-analyze-dialogflow-pipeline.md`.
- `tests/integration/` — cross-boundary tests (real backend, faked Google clients)
- `docs/` — see below
- `test_agent.py` — teammate's reference script for the retired Dialogflow CX
  playbook; kept as a standalone reference, no longer mirrored by any backend client

## Before changing anything architectural

Read `docs/adr/` first. Each file is one decision with its reasoning. If you're about
to make a different choice than what's recorded there, add a new ADR (or mark the old
one superseded) — don't silently deviate. See `docs/adr/0002-*.md` for an example:
an earlier assumption (Agent Engine `reasoningEngines`) turned out to be wrong once a
teammate's real reference script surfaced (Dialogflow CX `detectIntent`), and the ADR
records both the wrong assumption and the correction rather than pretending it was
right from the start.

For business/product context (why this exists, who it's for), read `docs/product/`.

## Progress logging — one file per day, not per session

`docs/progress/YYYYMMDD.md` — **one file per calendar day**, not one per session or
per chunk of work. At the end of a work session (or a meaningfully complete chunk),
append a `## HH:MM — title` section to **today's** file summarizing:
- What changed
- Decisions made (and whether they need a new/updated ADR)
- Open TODOs / what's blocked and on what

If today's file doesn't exist yet, create it. If it does, add a new `##` section to
it — don't create a second file for the same day. Only start a new file when the
calendar date changes. Edit a prior day's file only to fix an error in it, not to
add new entries — new entries always go in today's file.

At the **start** of a session, read the most recent file in `docs/progress/` (sorted
by filename) to see where things left off before doing anything else.

## Running things

```bash
npm install                # once, at repo root
npm run dev:backend        # start the backend
npm run dev:frontend       # start the Vite dev server
npm test                   # all three suites
npm run test:frontend      # frontend unit/component tests
npm run test:backend       # backend unit tests
npm run test:integration   # cross-boundary tests
```

Requires Google Cloud ADC configured locally:
`gcloud auth application-default login --project silent-scholar-505618-u6`. See
`docs/adr/0003-google-auth-via-adc.md`.

## Testing constraint — do not simplify this away

Integration tests (`tests/integration/`) must exercise a **really-running backend
server** via the frontend's real `apiClient` — no mocking that hop, ever. Only the
external Google clients (captioning, research, video bucket upload, etc.) may be
faked, via injecting fake clients into `createApp(deps)`. If a future change makes
this constraint inconvenient, that's a signal to fix the design, not to quietly mock
the frontend→backend hop.
