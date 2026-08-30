# 0023. Detail rows use a freeform start/end range, not a subtitle-entry FK

Status: Accepted

## Context

ADR 0022 made every `DetailRow` store `subtitleEntryId`, an FK into
`film.subtitle.entries`, with the backend rejecting any row that doesn't reference a
real parsed subtitle entry, and the UI's Timestamp cell rendering as a `<select>`
constrained to those entries. That guaranteed a row could never claim a line was said
when it wasn't — a reasonable goal — but it also forces every row to be exactly one
subtitle line. Cultural-resonance issues frequently aren't dialogue at all: a visual
gag, a gesture, on-screen text, a beat with no dialogue in it whatsoever. Today's
model has no way to represent a finding like that, since there's no subtitle entry to
point the FK at.

## Decision

**`DetailRow` (and `DiscoveryResultRow`, which mirrors it) now stores its own
`startMs`/`endMs` range** instead of `subtitleEntryId` — any `endMs > startMs >= 0`,
not constrained to match a subtitle entry's boundaries. `subtitleText` stays a
denormalized display field, but it's now *derived*: `subtitleTextForRange()`
overlap-joins the film's parsed subtitle entries against `[startMs, endMs)` and
concatenates their text (in order), rather than being copied verbatim from one FK'd
entry. A row over a silent visual gag simply derives `subtitleText: ''`. The single
`timestamp` display string is dropped entirely — with independent start and end there
is no one unambiguous "the" timestamp, so the UI now shows Start and End as their own
columns, formatted client-side from `startMs`/`endMs` on the fly.

**Scope is deliberately limited to the storage/editing model.** The Discovery Agent's
own Gemini prompt and response schema (`discoveryAgent.ts`) are unchanged — it still
anchors every finding to one real subtitle entry id, and that id's own
`startMs`/`endMs` become the row's range when the finding is turned into a
`DetailRow` (a subtitle-anchored row is simply the special case of a freeform range
that happens to exactly match one entry's boundaries). Teaching the agent itself to
propose non-dialogue-anchored ranges is a natural follow-up, not built here.

## Consequences

- A `DetailRow`/`DiscoveryResultRow` can now legitimately have `subtitleText: ''`
  (a moment with no dialogue in it) — this is an expected, valid state, not an error,
  and downstream consumers (`detailRowsToProjectItems.ts`) already tolerate an empty
  `scriptLine` via their existing `sceneDescription` fallback chain.
  - The film-creation requirement from 0022 — a real timestamped subtitle file
  must be uploaded and parsed before a film can be created — is unaffected by this
  ADR; only the DetailRow FK constraint and its `<select>`-based UI are superseded.
- The backend can validate `endMs > startMs >= 0` but has no server-side notion of
  the video's actual duration to bound `endMs` against (that's only known
  client-side, from the `<video>` element) — same limitation `VideoScrubber.tsx`
  already works around by clamping out-of-range entries defensively at render time
  rather than rejecting them at the source.

## Update: the Discovery Agent itself now proposes freeform ranges

Built the follow-up flagged above. `discoveryAgent.ts`'s Gemini response schema no
longer has a `subtitleEntryId` field — the model now supplies its own `startMs`/
`endMs` (integer ms, `endMs > startMs`) per finding, validated the same way the
storage layer already does. The subtitle track is still given to the model as
context (for pacing/duration grounding), but the prompt now explicitly says findings
don't need to match any entry's boundaries — a visual gag or silent beat should get
a range with no dialogue in it. `subtitleText` is derived via the same
`subtitleTextForRange()` helper the storage/UI layer uses (a row over dialogue-free
seconds legitimately derives `''`), rather than being copied from a matched entry.

`mockDiscoveryAgent.ts` got the equivalent treatment for demoability without
needing real Gemini calls: alongside its usual dialogue-anchored picks, it now
proposes one freeform row in the gap after the first subtitle entry (clamped to
never overlap the next entry, even when two lines sit only milliseconds apart —
first version fell back to a flat "+1500ms" that could still land inside the next
entry, producing a "silent" row whose derived text wasn't actually empty). Caught
this by live-testing against the real 126-line "Disney's Inside Out" film rather
than just the unit test's more sparsely-spaced fixture — the fixture's generous
gaps didn't exercise the tight-packing edge case at all.
