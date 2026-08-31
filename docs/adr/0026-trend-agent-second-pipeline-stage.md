# 0026. Trend Agent as a second, distinct pipeline stage

Status: Accepted

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

## Decision

Added a **Trend Agent** (`backend/src/services/trendAgent.ts`, mock counterpart
`mockTrendAgent.ts`, following the existing mock/real pair convention) as a **second,
distinct pipeline stage** chained after the Research agent inside the research-run
route, rather than folding trend-sourcing into Research's existing call. This keeps
the mandatory-grounding/citation guarantee isolated from the exhaustive rubric-scoring
logic Research already does.

Specific mechanisms:

- **Trigger scope**: the Trend Agent only runs on items where a batch result's
  `shouldTranscreate` is true AND at least one scored rubric is tagged
  `trendEligible: true` **and that rubric's own score is ≥ `TREND_TRIGGER_SCORE_
  THRESHOLD` (7)** — a new required field on `Rubric`/`CreateRubricInput`. The score
  check matters because the Research agent scores every rubric exhaustively for
  every item (one entry per rubric, always) — without it, a trend-eligible rubric's
  mere presence in the project's rubric set would route *any* flagged item through
  the Trend Agent, regardless of whether that item's actual concern was slang/memes
  at all. This shared check lives in `trendAgent.ts`'s exported `triggeringRubric()`
  and is used both by the route (to decide whether to call the Trend Agent for a
  batch at all) and internally by the Trend Agent (to build its search query) — one
  source of truth, not two independently-drifting filters. `defaultRubrics.ts` marks
  the 5 existing rubrics `false` and adds one new "Slang / meme reference" rubric
  marked `true`. The `POST`/`PATCH` rubric routes default a caller-omitted
  `trendEligible` to `false`, matching `weight`'s existing default behavior; the
  film-first project-creation bridge (`POST /api/films/:id/projects`) does the same
  for caller-supplied custom rubrics, since an explicit `undefined` value would
  otherwise reach Firestore's `.set()` and throw.
- **Additive, not replacing**: `ProjectItem` gains an optional
  `trendSuggestions: TrendSuggestion[] | null` field, persisted via a new
  `projectItemStore.setTrendSuggestions()` method — alongside the existing
  `suggestedReplacement`, never overwriting it. The research-run route's `batch_done`
  SSE event also carries `trendSuggestions` merged onto its per-item results (a
  wire-only augmentation of `ResearchResult`, since that type itself is the Research
  agent's own output shape and stays untouched) so the run's originating connection
  sees the finding immediately, without waiting for a re-fetch.
- **Direct `parallel-web` SDK call**, not Gemini's built-in tool or a raw `fetch` —
  the first standalone external SDK client in this codebase not routed through Gemini
  tool-calling (`parallelSearchClient.ts`, mirroring the `createXClient(config)`
  factory shape used elsewhere). It calls Parallel's `client.search({search_queries:
  [...]})` directly and returns structured `{url, title, snippet, publishedDate}`
  results. The Trend Agent then makes one Gemini call to pick/write suggestion text
  grounded in those specific results, but `sourceUrl`/`sourceTitle`/`publishedDate`
  are attached **programmatically from the SDK response**, not parsed from model
  text — a suggestion whose model-reported `source_url` doesn't match one of the
  given search results is dropped rather than trusted.
- **Reuses the existing `PARALLEL_API_KEY`/`config.parallelApiKey`** rather than
  introducing a second env var — it's the same Parallel account either way, and there
  is no independent-key-rotation need between the two call sites.
- **Automatic, chained per Research-agent batch**: the research-run route's
  `onBatchComplete` callback (already `async`, and — a real bugfix found while wiring
  this in — now properly `await`ed by `researchAgent.ts`/`mockResearchAgent.ts`,
  which previously fired it fire-and-forget) filters each batch's newly-flagged
  trend-eligible items, calls the Trend Agent, and merges `trendSuggestions` onto the
  batch's results before persisting and before the `batch_done` SSE event fires. A
  Trend Agent failure is swallowed (try/catch) and does not block delivering the
  Research results already computed for that batch. The await fix was necessary, not
  cosmetic: without it, the route's response could `res.end()` before a batch's Trend
  Agent lookup finished, and a subsequent `writeSSE` call would throw
  `ERR_STREAM_WRITE_AFTER_END` — caught via a real integration test failure during
  this work, not by inspection.
- **Staleness signal**: `TrendSuggestion.publishedDate` is a required field, and the
  frontend (`DetailExpansionPanel.tsx`) renders an explicit relative-age string (e.g.
  "sourced 3 months ago") next to the trend suggestion — the reviewer judges
  freshness themselves; there is no auto-expiry logic, consistent with this tool's
  human-in-the-loop review model.

## Consequences

- A second external paid dependency (`parallel-web` npm package, billed against the
  same Parallel account as the existing Marketplace subscription and the chat agent's
  raw REST call) is now called directly from backend code. Future changes to
  Parallel's Search API response shape only need updating in
  `parallelSearchClient.ts`'s narrow mapping function.
- Every `Rubric`/`CreateRubricInput` literal across the codebase (config, tests,
  fixtures) now must declare `trendEligible` explicitly — matches the
  exhaustive-declaration philosophy already used for `RubricScore`, but is a real,
  deliberate widening of the type's required surface, not an optional add-on.
- The Trend Agent adds one extra Parallel search call per trend-eligible flagged item,
  plus one extra Gemini call per Research batch that has any such items — additional
  latency and cost is scoped to trend-eligible rubrics only, not every research run.
- This does not solve freshness decay by itself (a trend picked during development can
  still be dead by ship time) — that risk is handed to the reviewer via the staleness
  indicator, not eliminated.
- There is no UI yet for toggling `trendEligible` on a custom rubric created through
  `RubricsEditor.tsx` — it always defaults to `false` for rubrics created that way.
  Only `defaultRubrics.ts`'s "Slang / meme reference" entry, or a rubric created
  directly via the API with `trendEligible: true`, will route to the Trend Agent.
  Left as a follow-up since it's additive UI, not required for the feature to work.
