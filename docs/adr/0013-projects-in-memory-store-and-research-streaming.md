# 0013. Projects: in-memory store, fixture-based items, SSE batch progress

Status: Accepted

## Context

0012 built the Research agent but deliberately didn't wire it into any route, since
Prioritization (the stage that would normally consume Research's output) doesn't
exist yet. A real human-facing use case showed up anyway: a UI where someone creates
a "project" (a film's script lines + video segments, scoped to one target country),
clicks a button to kick off Research, watches per-batch progress as it runs, and
inspects findings per item as they become available. This ADR covers the backend
decisions needed to support that screen.

Discovery's real output (`dialogflowClient.ts`'s `FlaggedLine`: `line`, `reason`,
`suggestedReplacement`) doesn't have an `id` or a `sceneDescription` — both required
by Research's `ResearchItem`. Reshaping Discovery's schema is out of scope here (it's
someone else's work); this ADR treats "a project already has its list of details" as
a given, populated via a simple create-project form for now, not a real Discovery call.

## Decision

**A new `Project` concept: script details + one target country, held in memory only.**
`backend/src/services/projectStore.ts` is a plain `Map<string, Project>` inside the
running process — no database. State is lost on every server restart. This is a
deliberate hackathon-scope tradeoff, explicitly discussed and chosen over standing up
Firestore now; revisit if projects need to survive a restart or be shared across
browsers.

**Rubrics get a placeholder default.** Since the real rubric list is still undecided,
`backend/src/config/defaultRubrics.ts` provides a small fixture list used only when a
project is created without explicit rubrics. `researchAgent.ts` itself still never
hardcodes rubrics — this default lives at the route layer, not inside the agent.

**Progress is streamed via the same typed-SSE pattern as Discovery (0006/0009), not
polling.** `POST /api/projects/:id/research` responds with `text/event-stream`,
writing `progress` → one `batch_done` event per finished batch → `done` (or `error`),
delivered via `fetch` + `ReadableStream` on the frontend, consistent with why 0009
chose that over `EventSource` (POST body support). The frame-parsing loop itself was
extracted into `frontend/src/api/sseStream.ts` so it's shared between the existing
`streamAnalyze` and the new `streamResearch`, instead of duplicated a second time.

**`ResearchAgent.researchBatch()` gained an optional `onBatchComplete` callback.**
Fired once per sequential batch (see 0012) with that batch's own item ids and results.
This is what lets the route report incremental progress and persist partial results to
the project store as each batch lands, without changing the batching logic itself or
breaking the existing unit tests (the callback is optional, so old call sites are
unaffected).

**`passcodeMiddleware` now also accepts the passcode as a query param, not only in the
request body.** The new `GET /api/projects` and `GET /api/projects/:id` endpoints are
real GETs (no request body by convention), unlike every existing guarded endpoint,
which were all POSTs. Query param is the fallback only for GETs; POST/streaming
requests keep sending it in the body as before.

**Test mode applies the same way as Discovery (0010).** `POST .../research` defaults
to the mock research agent unless `testMode` is explicitly `false`, for the same
never-accidentally-hit-the-paid-API reason.

## Consequences

- A server restart silently wipes every project — acceptable for a hackathon demo
  someone drives themselves, not acceptable if this needs to survive between sessions
  or be shared with someone else's browser. No migration path implemented yet.
- The "list of details" a project is created from is manually entered / fixture data
  for now, not a real Discovery call — there's a known schema gap (no `id` or
  `sceneDescription` in Discovery's current output) that has to be resolved before
  these two stages can be connected for real.
- Adding `roles/aiplatform.user` (0012) is still required for real (non-test-mode)
  research to work in production; nothing here changes that.
- The default rubric list is provisional placeholder content, not a real decision
  about what rubrics the product should ship with — don't treat its presence here as
  that decision having been made.
