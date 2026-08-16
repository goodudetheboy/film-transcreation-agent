# 0010. Test mode: frontend-controlled mock data path, on by default

Status: Accepted

## Context

Working on the frontend, demoing, or iterating on UI shouldn't require live Google
Cloud credentials or spend Dialogflow CX quota on every click of "Analyze." Local
ADC setup (0003) is also a real onboarding step — someone should be able to clone
the repo and try the app immediately, before they've done any GCP setup at all.

## Decision

The frontend has a "Test mode" checkbox next to Analyze, **checked by default**. It
sends `testMode` in the `/api/analyze` request body. The backend's `analyzeRoute`
picks between two `DialogflowClient` implementations per request:
- `testMode` true or omitted → `mockDialogflowClient` (canned data, see below)
- `testMode` explicitly `false` → the real `dialogflowClient` (0002)

**Defaults to mock unless explicitly disabled** (`testMode !== false`), not the other
way around — a caller that forgets the flag entirely should never accidentally hit
the real paid API.

The canned response (`backend/src/services/mockDialogflowClient.ts`) reuses the
documented real cases from the pitch (Pixar's Inside Out broccoli→green-pepper swap,
a US-specific DMV reference) rather than inventing scenarios — consistent with the
pitch's own instruction to "use documented cases... so the answers are verifiable
against published sources."

## Consequences

- Anyone can clone the repo, run `scripts/dev.sh`, and use the full UI flow
  immediately — no GCP project access required for that path.
- **The real demo moment requires remembering to uncheck the box.** Worth calling
  out explicitly during a live demo so it doesn't look like the pipeline is faking
  results.
- Mock data is fixed content, not derived from the submitted script/country — it
  validates the UI/streaming pipeline, not the actual model's localization quality.
  Don't use test-mode output to judge whether the real agent is any good.
- Same `AnalyzeRouteDeps` dependency-injection seam used for testing (0002's design
  note about the seam supporting swaps) now also carries the mock/real switch at
  runtime, not just in tests.
