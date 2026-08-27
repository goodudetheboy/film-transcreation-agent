# 0017. Remove the Analyze tab and Dialogflow CX pipeline

Status: Accepted

## Context

The original product shape (0002/0003) was: submit a script + target country on the
Analyze tab, get back flagged lines via Dialogflow CX `detectIntent`
(`dialogflowClient.ts`, `/api/analyze`, streamed as SSE). Since then the app grew a
second, now-primary pipeline: Films → Discover Agent (real Gemini/Vertex captioning
of the actual video, 0015) → Project, scoped to a target country → Research agent
(Gemini + Parallel web grounding, 0012/0014), with real persistence (0016). The two
pipelines duplicated the same job (flag lines for a target country) through different
mechanisms, and the Analyze/Dialogflow one had no callers left — nothing in the Films
flow ever invoked it. Keeping both was confusing UI surface for no benefit.

## Decision

**Removed entirely**, not just hidden: the Analyze nav tab and view
(`AnalyzeView.tsx`), `dialogflowClient.ts` / `mockDialogflowClient.ts` and the
`@google-cloud/dialogflow-cx` dependency, `POST /api/analyze` (`routes/analyze.ts`),
and everything that only existed to support that flow —
`ResultsList.tsx`/`resultsStore.ts` (Analyze's own results UI/state) and
`ErrorBanner.tsx` (only ever wired to `resultsStore`'s error state at the app-header
level). Config keys `DIALOGFLOW_LOCATION`, `DIALOGFLOW_AGENT_ID`, `MAX_SCRIPT_LINES`,
and `REVEAL_DELAY_MS` were dropped from `Config`/`.env.example` since nothing reads
them anymore. Frontend `AgentEvent`/`FlaggedLine` types and the `streamAnalyze` client
function went with it; `sseStream.ts`'s frame-parsing helper stays, since
`streamResearch` still uses it.

## Consequences

- The product's only script-in/flagged-lines-out path is now Films → Discover Agent →
  Project → Research. A user can no longer paste a bare script without an associated
  film/video — that's a real capability loss if anyone wanted analysis without a
  video, but nothing in the current UI offered a way to reach that state anyway.
- Any external reference to `/api/analyze` (e.g. a saved bookmark, an old integration)
  now 404s. No migration/redirect was added — this app has one local user per the
  existing hackathon-scope conventions (0013), so this was judged not worth the
  complexity.
- `test_agent.py` (the teammate's reference script for the Dialogflow CX playbook,
  referenced in CLAUDE.md's repo map) is untouched — it's a standalone script, not
  part of the running app, and removing the backend client doesn't affect it existing
  as a reference on disk.
