# 0025. Projects: Firestore pipeline, film-first creation, tool-calling research chat

Status: Accepted — supersedes 0013, extends 0012/0014

## Context

Today "Projects" and "Films" barely talk to each other. `NewProjectView.tsx` let a
user type script lines freehand with no link to any Film. The one existing bridge
(`POST /api/films/:id/create-project` → `detailRowsToProjectItems.ts`) pulled in
**every** DetailRow unconditionally and flattened each into
`{scriptLine, sceneDescription}` strings — discarding `startMs`/`endMs`, custom
column values, and any FK back to the source row. `projectStore.ts` was a plain
in-memory `Map` (0013's deliberate-but-provisional tradeoff — "revisit if projects
need to survive a restart"). The Research agent (`researchAgent.ts`, 0012/0014) is a
one-shot batch call with no memory, no follow-up, and no way to interactively refine
a finding. `ProjectDetailView.tsx` was a flat expandable list with no accept/reject
workflow.

The user supplied a hand-drawn wireframe for a real localization-triage workflow: a
Project Library grouped by country, a Film-first creation wizard that lets a human
pick which of a Film's details to research, a filterable/sortable workspace table
with an Accepted/Pending/Rejected/Need-research status per detail, and — the
centerpiece — a live, streaming, tool-calling chat agent per project that can edit a
rubric's justification "live in front of your eye" (their words: "Claude Code edit
mode"), with multiple swappable, persisted chat sessions per project.

Four architectural questions were confirmed directly with the user before this work
started:
1. Chat scope is **per-project** (swappable sessions), not per-detail-row.
2. Project creation is **always Film-first** — the freehand path is deleted entirely.
3. Accepted/Pending/Rejected/Need-research status lives **per (Project, DetailRow)
   pair**, not globally on the Film's DetailRow.
4. The tool-calling live-edit agent is **built for real now**, not stubbed.

This closes 0013's explicitly-flagged schema gap, extends 0012/0014's Research agent
scope, and introduces the first tool-calling (function-calling) Gemini agent in this
codebase — there was zero existing precedent for `functionDeclarations`/
`functionCall` handling anywhere in the repo before this.

## Decision

**`projectStore.ts` moves from an in-memory `Map` to Firestore**, following the exact
`films/{filmId}/...` nesting convention `detailRowsStore.ts`/`discoveryJobStore.ts`
already use:

```
projects/{projectId}                          -> Project
projects/{projectId}/rubrics/{rubricId}        -> Rubric
projects/{projectId}/items/{itemId}            -> ProjectItem
projects/{projectId}/researchRuns/{runId}      -> ResearchRun
projects/{projectId}/chatSessions/{sessionId}  -> ChatSession   (turns embedded in-doc)
```

Three things made this non-optional now, not just "nice to have": chat sessions must
survive navigation/restart, which is incoherent on top of a volatile parent store;
the Project Library's Agent-Status column must reflect run/session state with
nobody's SSE stream open, same reason `discoveryJobStore.ts` is on Firestore; and
Projects becoming a real Film-bridged entity makes them the one remaining
non-Firestore outlier in an otherwise fully-Firestore app. Each new store
(`projectStore.ts`, `projectRubricStore.ts`, `projectItemStore.ts`,
`researchRunStore.ts`, `chatSessionStore.ts`) follows the established convention
exactly: an async `interface XStore`, `createFirestoreXStore(firestore)` doing
full-doc read-modify-write `.set()`, and `createInMemoryXStore()` as an
identical-interface `Map`-backed fake for tests — no variant shapes.

**Project creation is Film-first only, and never imports every DetailRow
unconditionally.** `POST /api/films/:filmId/projects` replaces the deleted
`POST /api/films/:id/create-project` bridge. The caller must pass an explicit
`detailRowIds: string[]` — the new `projectItemImport.ts` (replacing
`detailRowsToProjectItems.ts`) converts only that selection into `ProjectItem`s,
preserving `startMs`/`endMs`/`customValues` and a `detailRowId` FK back to the
source row, closing the exact gap 0013 flagged. The freehand `POST /api/projects`
route is gone entirely — there is no way to create a Project that isn't rooted in a
Film's curated Details.

**Accept/Pending/Rejected/Need-research status lives on `ProjectItem.action`, one
value per (Project, DetailRow) pair** — a DetailRow reused across two Projects (e.g.
Japan and France) can be accepted in one and still pending in the other, since the
status is a property of the *item* record inside a specific project's `items`
subcollection, not written back onto the shared DetailRow.

**Two agents, not one, and they stay split.** `researchAgent.ts` stays exactly what
it was — a one-shot, non-streaming batch call for bulk runs — with only a light touch
(types now import from the new `projectTypes.ts`, and the prompt surfaces each
rubric's `weight` as informational context). The new `researchChatAgent.ts` is a
separate, streaming, tool-calling agent for interactive per-item edits. This is not
a replacement or a merge: a batch run scores every item against every rubric
exhaustively in one shot; the chat agent has a conversation and mutates one rubric
score (or proposes a replacement, or searches the web) at a time, live, with the
human watching. `importanceScore.ts`'s `computeImportanceScore(scores, rubrics)` is
the one shared piece of logic between them — both the batch path (applying a full
`ResearchResult`) and the chat tool-call path (patching one score) compute an
item's sortable importance number identically, so the two paths can never disagree.

**The tool-calling agent's v1 function set is `update_rubric_score`,
`propose_replacement`, and `search_web` — and deliberately excludes anything that
changes `ProjectItem.action`.** Accept/reject/pending/need-research stays a
human-only decision, made by clicking in the table or detail panel, never by a tool
call. This is a human-in-the-loop scope decision, not an oversight: the agent can
*say* "consider marking this need-research" in its reply text, but it can never flip
the status field itself.

**`search_web` is its own custom function calling Parallel's REST API directly —
never the built-in `parallelAiSearch` Gemini tool.** This was resolved by research,
not left as a spike. Google's own docs state the Gemini API "doesn't support
combining search tools ... with non-search tools (such as function calling) ... in
the same `generateContent` request" prior to Gemini 3, and returns a hard **HTTP
400**: *"Built-in tools (google_search) and Custom tools (Function Calling) cannot
be combined in the same request"*
([Grounding with your search API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-your-search-api)).
Gemini 3's "tool context circulation" feature makes the combination possible on the
direct Gemini Developer API ([Combine built-in tools and function
calling](https://ai.google.dev/gemini-api/docs/tool-combination)), but that's
undocumented for Vertex AI, scoped to `gemini-3.7-flash`-class models in the
examples, and its supported-built-ins table lists only Google-owned tools (Google
Search, Maps, URL Context, File Search) — `parallelAiSearch`, a Marketplace/
third-party grounding tool, is not among them regardless of model version. This app
runs Vertex AI (`vertexai: true`) on `gemini-2.5-flash` by default
(`config/env.ts`), squarely in the unsupported combination — permanently, not a
temporary gap to revisit once a model upgrade lands.

Instead, `search_web` is its own `functionDeclarations` entry whose executor calls
`POST https://api.parallel.ai/v1/search` directly via Node's `fetch()`, using the
`parallelApiKey` config field that already existed as a bring-your-own-key escape
hatch (0012) but was, until now, wired and unused in production. Because this is a
genuine `functionCall` → our own `fetch()` → `functionResponse` round-trip instead
of an opaque built-in grounding tool, the backend has full visibility into the call
and emits it through the same `tool_call`/`tool_result` SSE events every other tool
uses — the real `search_queries` sent, the real `results` (urls/titles/excerpts)
that came back. `ResearchChatPanel.tsx` renders this as a distinct "🔍 Searching the
web via Parallel…" step instead of a generic spinner, which matters for this
specific hackathon: it's Parallel-sponsored, and the user explicitly asked for the
Parallel call to be visibly demoable. Net effect: safer (no 400 risk) and a more
compelling demo than the built-in tool would have been anyway, since the built-in
tool's search activity isn't otherwise inspectable or renderable at all.

**The chat agent's `runTurn` persists `session.turns` after every round, not just at
stream end.** Generalizing Discovery's "replay stored contents + append new turn"
pattern (`discoveryAgent.ts`) to multi-round tool-calling: each round appends the
model's turn (text and/or function calls), executes any tool calls, appends the
resulting `functionResponse` turn, and writes the whole `turns` array back to
Firestore before starting the next round. This matters because a tool call's
mutation (e.g. a `patchScore()` write) already lands in `projectItemStore` the
moment it executes — if the connection drops mid-round and only the final state
were persisted, the store and the replayed chat history would disagree about what
happened. Confirmed the streamed `functionCall` chunk shape
(`chunk.candidates[0].content.parts[i].functionCall`) against a real Vertex AI
`generateContentStream` call with ADC before writing this loop, per Google's
sample ([Generate Content using Function
Calling](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/googlegenaisdk-tools-func-desc-with-txt)).

**One disclosed deviation from the plan's sketched tool signatures**: since chat is
project-scoped (not per-detail-row) and the plan's sketch of
`POST .../chat-sessions/:sessionId/messages` didn't include an item reference, an
optional `itemId` was added to that route's body — which item's detail panel a given
message was sent from. Without it, `update_rubric_score`/`propose_replacement` have
no way to know which `ProjectItem` to mutate, since chat sessions themselves aren't
tied to one item. This is the smallest addition that makes the plan's exact tool
signatures (no `itemId` parameter on the tools themselves) actually work: the
backend injects the open item's current state into the system instruction and
implicitly scopes tool execution to it, rather than requiring the model to pass an
item id on every call.

**Research runs and chat turns run foreground/inline per request, not through
Discovery's global sequential queue (`discoveryQueueWorker.ts`).** This matches how
batch research already behaved pre-0025, but is a real, deliberate divergence from
Discovery's "never N simultaneous Gemini calls" guarantee: a research run and a chat
turn (or several chat turns in different sessions) can now execute concurrent Gemini
calls. Acceptable at this app's hackathon scale; a real production version would
need to decide whether that guarantee should extend here too.

**Two SSE conventions coexist for research runs, deliberately.** The `POST
/api/projects/:id/research-runs` kickoff route streams the rich, per-batch
`ResearchRunStreamEvent` union (`progress`/`batch_done` with real per-item
results/`done`/`error`) directly to whoever made the request — same "POST responds
with `text/event-stream`" shape 0013 established. The separate `GET
/api/projects/:id/research-runs/:runId/stream` resumable route mirrors
`films.ts`'s `discovery-jobs/:jobId/stream` and 0020's "replay the entire current
document, not a diff" convention instead: it re-sends the full current `ResearchRun`
document (`{type: 'run_update', run}`) on connect and on every subsequent change,
until a terminal status. The resumable route only carries run-level state
(status/batch counters), not each batch's per-item results — those already live in
`ProjectItem` documents, independently fetchable, so a resumed client doesn't need
them replayed a second time.

## Consequences

- No project can exist without a source Film anymore — the old standalone "type in
  script lines" flow is gone. Anyone who wants to research freeform text with no
  Film behind it has no path to do that; not a regression from this app's actual
  usage pattern, but a real capability removed.
- A Firestore migration means projects, like films, are now subject to the same
  single-shared-passcode, no-per-user-identity security model (0003/0005/0020) —
  nothing new here, just extending what already applies to films/discovery jobs.
- Discovery's single-sequential-Gemini-call guarantee no longer holds app-wide: a
  batch research run, several chat sessions, and a Discovery pass can now all be
  mid-flight at once. If Gemini/Vertex rate limits become a real problem, this is
  the first place to look.
- `search_web`'s dependency on `parallelApiKey` being configured is now load-bearing
  for the chat agent's third tool (previously it was only a fallback path for the
  batch agent's built-in grounding tool) — if the key is missing or invalid in a
  given environment, `search_web` tool calls return a visible `{error: ...}`
  `functionResponse` rather than failing the whole turn, since Gemini can recover
  from a tool error mid-conversation the way it can't from a hard request-level 400.
- The chat agent's `itemId`-on-the-message-body design means a chat session's tool
  calls are only ever as good as whatever item the frontend says is "currently
  open" — if the UI ever lets a user send a message with the wrong item's panel
  open, the agent will confidently mutate the wrong item. No cross-check against
  the conversation's own text exists to catch that.
