# 0019. Discovery agent: generalized, dynamic-schema, multi-pass Gemini calls

Status: Accepted (supersedes the fixed dialogue/gesture schema portion of 0015)

## Context

0015 built a single fixed-schema Gemini video-understanding call (dialogue + gesture
logs only) behind `/api/preprocess-video`. The new film workspace's "Kick off agentic
discovery" flow needs something materially more flexible: the user names an agent
pass, gives it a free-text special instruction, and picks which Details-table columns
(built-in or their own custom ones) that pass should fill in — and can re-run the same
pass with a follow-up comment, expecting the agent to remember what it already found.

## Decision

**Same underlying technique, dynamic prompt and response schema per call.**
`backend/src/services/discoveryAgent.ts` reuses exactly the technique 0015
established (`@google/genai`, `vertexai: true`, `generateContent`, the same
`MAX_TOKENS` finish-reason guard) but builds the `systemInstruction` and
`responseSchema` from the pass's `specialInstruction` and `targetColumns` at call
time, instead of the old hardcoded `dialogue`/`gestures` shape. Every subtitle entry
on the film is embedded in the prompt with its own `id`, and the model is required to
anchor every flagged row to one of those ids (`subtitleEntryId` is a required response
field) — rows referencing an id that doesn't exist are dropped before being returned,
the server-side half of the "Timestamp/Subtitle must come from the parsed subtitle
file" rule (the UI picker in `DetailsTable.tsx` is the other half).

**Multi-turn conversation, persisted and replayed — not a separate caching
mechanism.** A pass's first run sends one `user` turn (instruction text + the video
`fileData`). A comment-driven re-run appends the *stored* `conversationHistory` from
the job's Firestore document plus one new `user` turn containing just the comment
text (no video re-attached) — Gemini gets genuine prior-turn context because the
`contents` array is real, not because of any special session/cache API.
`conversationHistory` is written back after every run (`discoveryJobStore.ts`), so
"the agent remembers what it already found" is exactly "we replay what we already
sent it."

**`captioningClient.ts`/`mockCaptioningClient.ts` and `/api/preprocess-video` are
removed**, not kept alongside the new agent — confirmed via grep that nothing else in
the app referenced them (no standalone "Video Preprocessing" view existed outside the
retired `FilmDetailView`). `mockDiscoveryAgent.ts` replaces `mockCaptioningClient.ts`,
now with a realistic simulated delay (see 0021) instead of resolving instantly.

## Consequences

- One fewer Gemini call shape to maintain; `discoveryAgent.ts` is now the only video-
  understanding entry point in the app, alongside the text-only Research agent
  (0012).
- A pass's `targetColumns` values map 1:1 onto response-schema properties, so a
  custom column name becomes part of the prompt/schema verbatim — no sanitization
  beyond what `detailRowsStore.ts`'s `columnKeyFromName` already does when the column
  was created. Not a security concern (this data never reaches a shell/SQL boundary),
  but worth knowing if a very unusual column name ever produces a confusing prompt.
- The old fixed `DialogueLine`/`GestureLog` fields (`character`, `expression`,
  `narrativeLoad`, `backgroundNote`) have no direct equivalent — a pass that wants
  that kind of nuance now expresses it via `specialInstruction` free text instead of
  a dedicated schema field. Nothing forced this loss; it's a real simplification
  traded for generality.
