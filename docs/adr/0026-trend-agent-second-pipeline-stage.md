# 0026. Trend Agent as a manual, per-item, ungated action

Status: Accepted (supersedes this ADR's own original automatic-chaining design)

## Context

Today's replacement suggestions (`ProjectItem.suggestedReplacement`) come entirely
from Gemini's general knowledge, generated inside `researchAgent.ts`'s single
per-batch call. That works for evergreen references but is weak for anything socially
current — slang, memes, viral phrases — since a model's knowledge is frozen at
training time and trends move fast. Sourcing this kind of suggestion needs a live,
dated, citable source, not a model assertion, to be trustworthy to a reviewer.

Where should this live? Not on the Film side: `Film` is a persistent, country-agnostic
object (script, video, Discovery Agent output only) reused across many target
countries, and trending content is inherently country-specific and time-sensitive.
There's also no existing "flag it in Film, fix it in Project" split to extend — the
Research agent already does both scoring and suggestion generation together, in
Project's scope (see 0025's rewrite of the Projects pipeline onto Firestore). This
decision only concerns how to extend that Project-side pipeline further.

The existing Research agent already has a Parallel Web Search integration, but it's
Gemini's built-in `parallelAiSearch` tool, used *lazily* — only when the model is
"genuinely uncertain" — with no requirement that the model report back a verifiable
date or url for what it found. `researchChatAgent.ts`'s `search_web` tool call is
similarly informal (a raw `fetch` to Parallel's REST endpoint, model-mediated). Neither
is enough for a feature whose entire value proposition is verifiability.

### First design, and why it changed

The original version of this ADR chained the Trend Agent automatically inside the
research-run route: after each batch, any item that came back `shouldTranscreate:
true` with a trend-eligible rubric scoring ≥7 was routed through the Trend Agent
before `batch_done` fired. That required a real gating mechanism (a score threshold,
because the Research agent scores every rubric exhaustively for every item, so a
trend-eligible rubric's mere *presence* in the project would otherwise match nearly
any flagged item) and an `await` fix in `researchAgent.ts`/`mockResearchAgent.ts`
(their `onBatchComplete` callback was fire-and-forget, which raced with the route's
own response lifecycle once the callback started doing async Trend Agent work).

That design was replaced after using it: bundling the Trend Agent into "Kick off
agentic research" made it a passenger on someone else's button — its behavior wasn't
independently controllable, and every research run paid its latency/cost whether or
not the reviewer wanted a trend suggestion. The decision below reflects the design
actually shipped.

## Decision

The Trend Agent is a **manual, per-item action**, entirely separate from "Kick off
agentic research." A new button in `DetailExpansionPanel.tsx` — "Find Trend-Sourced
Alternative," shown whenever the project has at least one `trendEligible` rubric
configured — calls a new endpoint that runs the Trend Agent for exactly the one
selected item, on demand.

Specific mechanisms:

- **Ungated by design**: the click itself is the trigger. There is no
  `shouldTranscreate` or score check — the reviewer can run it on any item, including
  one that has never been through a research run at all (`shouldTranscreate: null`).
  This is a deliberate simplification made possible by dropping automatic chaining:
  gating only ever existed to avoid needless calls during a *bulk* run; a single
  explicit click doesn't need that protection.
- **New route**: `POST /api/projects/:id/items/:itemId/trend-research`. Looks up the
  project's `trendEligible` rubrics (400 if there are none), calls the Trend Agent for
  that one item using those rubrics, persists the result via
  `projectItemStore.setTrendSuggestions()`, and returns the updated `ProjectItem`
  synchronously (200) — no SSE, unlike the batch research-run route, since this is
  always exactly one item.
- **`trendAgent.ts`'s interface is single-item and rubric-driven**, not
  batch/score-driven: `findTrendSuggestions({ item, targetCountry, rubrics })` where
  `rubrics` is whatever the caller decides to search for (normally the project's
  trend-eligible rubrics) — it returns `TrendSuggestion[]` directly, with no
  score-threshold logic inside it at all. The batch-oriented shape, the
  `TREND_TRIGGER_SCORE_THRESHOLD` constant, and the exported `triggeringRubric()`
  gating helper from the first design are all gone — there is no longer anything to
  gate.
- **Additive, not replacing**: `ProjectItem.trendSuggestions: TrendSuggestion[] | null`
  sits alongside the existing `suggestedReplacement`, never overwriting it — unchanged
  from the original design. `null` still means "never run"; `[]` means "ran, found
  nothing."
- **Direct `parallel-web` SDK call**, not Gemini's built-in tool or a raw `fetch` —
  the first standalone external SDK client in this codebase not routed through Gemini
  tool-calling (`parallelSearchClient.ts`, mirroring the `createXClient(config)`
  factory shape used elsewhere). One search per rubric passed in (normally one),
  merged into a single Gemini call that picks/writes suggestion text grounded in those
  results — `sourceUrl`/`sourceTitle`/`publishedDate` are attached **programmatically
  from the SDK response**, not parsed from model text; a suggestion whose
  model-reported `source_url` doesn't match a real search result is dropped.
- **Reuses the existing `PARALLEL_API_KEY`/`config.parallelApiKey`** rather than
  introducing a second env var.
- **`testMode` still applies**: the route picks `mockTrendAgent`/`trendAgent` the same
  way the research-run route does, defaulting to mock unless the request explicitly
  sets `testMode: false`.
- **Staleness signal unchanged**: `TrendSuggestion.publishedDate` is required, and
  `DetailExpansionPanel.tsx` renders an explicit relative-age string ("sourced 3
  months ago") — the reviewer judges freshness themselves; no auto-expiry.
- **`researchAgent.ts`'s `onBatchComplete` await fix is kept** even though the Trend
  Agent no longer runs inside it — it was a genuine pre-existing correctness gap
  (found via a real `ERR_STREAM_WRITE_AFTER_END` failure during the original chaining
  work), not something specific to the removed feature.

## Consequences

- A second external paid dependency (`parallel-web` npm package, billed against the
  same Parallel account as the existing Marketplace subscription and the chat agent's
  raw REST call) is called directly from backend code, one item at a time, only when
  a reviewer explicitly asks for it — cost/latency is opt-in, not a tax on every
  research run.
- Every `Rubric`/`CreateRubricInput` literal across the codebase still must declare
  `trendEligible` explicitly (unchanged from the original design) — this is what
  drives the new button's visibility, not any scoring behavior.
- There is no UI yet for toggling `trendEligible` on a custom rubric created through
  `RubricsEditor.tsx` — it always defaults to `false` for rubrics created that way.
  Only `defaultRubrics.ts`'s "Slang / meme reference" entry, or a rubric created
  directly via the API with `trendEligible: true`, makes the button appear. Left as a
  follow-up, not required for the feature to work.
- This does not solve freshness decay by itself (a trend picked during development can
  still be dead by ship time) — that risk is handed to the reviewer via the staleness
  indicator, not eliminated.
