# 0015. Video captioning via Gemini/Vertex AI, single-shot JSON (not SSE)

Status: Accepted

Note: originally numbered `0012`; renumbered to `0015` while reconciling with
`origin/main`, which had independently used `0012` for an unrelated decision
(the Research agent, see that `0012`). No content changed by the renumbering.

## Context

A new "Video Preprocessing" flow lets the user paste a video URL and get back a
log of every gesture/body-language cue in it — a later step can feed that into
localization triage (a thumbs-up or OK sign can read very differently, or
offensively, in some cultures). This is separate from `/api/analyze` (0002),
which only ever takes typed-in script text.

`captioning_test.py` already proved out both the technique (Gemini video
understanding via the `google-genai` SDK, against a GCS-hosted video, with
structured JSON output) **and the exact task** — gesture detection. An earlier
draft of this ADR mistakenly reused the technique with a *different* prompt
(dialogue transcription), which produced the wrong output; corrected to mirror
`captioning_test.py`'s `GESTURE_PROMPT`/`GestureLog` exactly.

## Decision

- **Model:** Gemini via Vertex AI (`@google/genai`, `vertexai: true`), same GCP
  project as Dialogflow CX. Reuses the existing `geminiLocation`/`geminiModel`
  config (`GEMINI_LOCATION`/`GEMINI_MODEL`, default `us-central1`/
  `gemini-2.5-flash`) that `researchAgent.ts` (0012) already introduced, rather
  than adding a second, redundant pair of env vars for the same underlying need
  — this was originally `CAPTIONING_LOCATION`/`CAPTIONING_MODEL_ID` before that
  consolidation, done while reconciling with `origin/main`'s Research agent
  work (see `docs/progress/20260825.md`'s 10:15 entry).
- **Prompt and schema mirror `captioning_test.py` exactly** — same
  `GESTURE_PROMPT` text, same fields per entry:
  `timecode`, `gesture`, `character`, `narrativeLoad`, `backgroundNote`
  (camelCase versions of the Python `GestureLog` fields). The prompt itself
  doesn't constrain `narrativeLoad` to specific enum values (Python's
  `load_bearing`/`supporting`/`incidental` was a code comment, not part of the
  text sent to Gemini) — expect free-text values like "Low"/"Medium"/"High" in
  practice, matching what the Python script would also produce.
- **`maxOutputTokens: 65536`**, with an explicit check on
  `response.candidates[0].finishReason === 'MAX_TOKENS'` that throws a clear
  error instead of silently parsing/returning truncated JSON. A gesture-dense
  video can produce 100+ entries; the initial implementation had no explicit
  token ceiling or truncation check, risking a silent partial result.
- **Video input is a URL only** (typically a `gs://` URI), not a file upload —
  the frontend never touches raw video bytes or GCS directly. Uploading a local
  file to GCS first is left as a manual/out-of-band step for now.
- **`POST /api/preprocess-video` responds with plain JSON (`{lines}`), not SSE.**
  Unlike `/api/analyze`'s synthesized progressive reveal (0006), there's no
  per-line reveal here — one Gemini call produces the whole log at once, and
  the frontend just shows a loading state until it resolves.
- Same dependency-injection and test-mode conventions as the analyze route
  (`services/captioningClient.ts` + `services/mockCaptioningClient.ts`, wired
  into `createApp(deps)` **and into `server.ts`** — the real dev/prod
  entrypoint needs its own explicit `createCaptioningClient(...)` construction,
  same as `dialogflowClient`; missing this in `server.ts` was a real bug caught
  during live verification, not just in `app.ts`/tests); `testMode !== false`
  picks mock, matching 0010.
- The mockup's "Country" field + "Do research" button on this new view are
  **stubbed** — visible in the UI, not wired to any downstream flow yet.

## Consequences

- Two different Google AI backends now power this app (Dialogflow CX for
  analysis, Gemini/Vertex for captioning) — `googleCloudProject` config is
  shared, but the two ADRs (0002, this one) should be read together to
  understand the full picture.
- Because there's no file-upload path yet, using this feature for real requires
  the video to already be reachable at a URL Gemini can fetch (e.g. already
  uploaded to a GCS bucket in the same project) — not yet a "drop an mp4 in"
  experience.
- Verified live against a real GCS video (`silent-scholar-505618-u6-clips`):
  118 gesture entries returned, full JSON, no truncation, ~75s response time.
- The gesture-log → script-analysis handoff ("Do research") is UI-only today;
  wiring it up, and deciding how gesture data actually informs localization
  triage, is a follow-up, not part of this change.
