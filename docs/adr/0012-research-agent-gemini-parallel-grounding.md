# 0012. Research agent: TypeScript, Gemini + Parallel Web Search, batched sequential calls

Status: Superseded by 0014

## Context

The full localization pipeline has four stages: Discovery (finds candidate lines and
scenes — already built, 0002), Research (checks each candidate against the target
country with real web evidence), Prioritization (scores/ranks — not built), Proposal
(suggests fixes — not built). Research needed to be added without touching Discovery
and without inventing Prioritization/Proposal's job.

Unlike Discovery (a Dialogflow CX Playbook), no existing reference implementation
dictated Research's shape, so the choice of model, grounding mechanism, and call
pattern was open.

## Decision

**Language: TypeScript, not Python.** The backend is already a TypeScript Express app
(0001); Research lives in `backend/src/services/researchAgent.ts` alongside
`dialogflowClient.ts`, following the same factory-function + typed-interface +
separate-mock-file shape, so it ships automatically with every push to `main` (the
Cloud Run deploy already builds the whole `backend/` folder).

**Model + grounding: Gemini via Vertex AI, with Parallel Web Search as a built-in
tool.** Uses `@google/genai` in Vertex AI mode (`vertexai: true`), so it authenticates
via the same Application Default Credentials mechanism as `@google-cloud/dialogflow-cx`
already does (0003) — no new credential type. Web grounding comes from Gemini's
built-in `parallelAiSearch` tool. Because this project has a Google Cloud Marketplace
subscription to "Parallel Web Search for Grounding" (not the general "Parallel Web
Systems" listing, which is for calling Parallel's APIs directly), the tool works with
**no separate API key** — `{ parallelAiSearch: {} }` is enough. A `parallelApiKey`
config field exists only as a bring-your-own-key escape hatch, not the default path.

**Batching: chunks of 10 items per call, sequential.** Sending one call per item would
multiply Gemini/Parallel calls needlessly; sending everything in one call risks
unreliable structured output across a large batch. 10 keeps output reliable while
cutting call count by roughly 10x versus one-per-item. Batches run one after another,
not concurrently, to stay under Gemini/Parallel rate limits without needing a separate
concurrency limiter — a latency-for-simplicity tradeoff, revisit if batch count grows
large enough that total wall-clock time becomes a real problem.

**Scope: evidence-gathering only, no ranking or fix.** For each item, the agent decides
which rubrics (an input parameter, never hardcoded — the real rubric list isn't decided
yet) plausibly apply, searches the web for each one that does, and reports
`reasonToChange`/`evidence`/`sources`/`changeDirection`. It does not rank items against
each other and does not propose a final replacement — that split is deliberate, so
Prioritization and Proposal (not built yet) each still have a real job to do.

**New IAM requirement.** The Cloud Run service account needs `roles/aiplatform.user`
on the project (alongside its existing Dialogflow API Client role), and the
`aiplatform.googleapis.com` API must be enabled — Dialogflow CX and Vertex AI are
different APIs, so this isn't automatically on. Documented in `docs/runbook.md`.

## Consequences

- Research can be developed and unit-tested entirely against a fake Gemini client
  (`createResearchAgent(config, { genAI })`) without live Google Cloud access or
  cost — same spirit as Discovery's mock/real split (0010).
- No new route calls Research yet in this ADR's scope — Prioritization doesn't exist,
  so there's nothing real to hand Research's output to. (Superseded in practice by
  0013, which does wire Research into a `Project`-scoped route once a human-facing use
  case — a "start scoring" button — existed.)
- If the Marketplace grounding path turns out not to work, the fallback is the
  `parallelApiKey` bring-your-own-key config field — already wired, untested until
  needed.
- Sequential batching means total latency scales linearly with item count divided by
  10. For very large scripts, this could become a real wait; no streaming/concurrency
  work has been done to address that yet.
