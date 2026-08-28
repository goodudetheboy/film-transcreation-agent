# 0020. Resumable live status: backend-owned SSE with Firestore-backed replay

Status: Accepted (extends 0006/0009, does not supersede them)

## Context

Both the new film-prep screen and the Discovery agent's "running" panel need live
status that survives a page reload or navigating away and back — the wireframe
explicitly shows re-opening a still-running pass's status panel. The existing SSE
pattern (0006/0009, used by Research agent progress) is a plain per-request stream:
reconnecting starts over with no history, which fails this requirement outright.

The alternative considered was giving the frontend a direct Firestore client
(`onSnapshot` listeners) for the relevant documents, since Firestore already gives
durable history "for free" once job/prep state lives there (0018).

## Decision

**Stay server-owned SSE; Firestore is the durability layer behind it, not something
the browser talks to directly.** The real requirement is "the history is durable and
re-servable," not "sub-second push latency" — solved by replaying what's already in
Firestore, not by exposing Firestore to the client.

A direct Firestore client in the frontend was rejected because it would require: the
Firebase JS SDK (a dependency surface this app doesn't otherwise have) and a genuine
per-request Firestore security-rules story — this app has exactly one shared passcode
and no per-user identity, and 0003/0005 are explicit that Google credentials stay
server-side. `firestore.rules` (added alongside this ADR) denies all direct
read/write for exactly this reason — a future accidental client-SDK usage fails
closed instead of silently exposing data.

**Mechanics** (`GET /api/films/:id/prep-status`, `GET
/api/films/:id/discovery-jobs/:jobId/stream`, both in `routes/films.ts`): each route
subscribes to `discoveryEventBus.ts` for its channel, re-reads the current Firestore
document, and sends it as one `data: {...}\n\n` frame — the *entire* current
prep/job state, not a diff — then forwards every subsequent bus event the same way
until a terminal state (`ready`/`error` for prep, `done`/`error` for a job), at which
point it ends the response. If the document is already terminal when the client
connects, the single replayed frame **is** the complete history and the stream ends
immediately — no dangling connection. Same typed-frame wire format as 0006
(`data: <json>\n\n`, discriminated by an inner `type` field, no SSE `event:` lines);
the frontend reuses the existing `parseSSEStream<TEvent>` (0009) unchanged. A view
just calls the stream function again on mount — no separate "is this already
running?" check needed, since replay always gives the full picture.

**`discoveryEventBus.ts`** is a plain in-process `EventEmitter`. This only works
correctly with a single backend process — an SSE client connected to one Cloud Run
instance would never hear about a job finished on another instance. Acceptable at
this app's hackathon scope (effectively one instance); a real multi-instance
deployment would need a shared pub/sub layer (e.g. Firestore's own realtime
listeners used server-side, or Pub/Sub) instead of this in-process emitter.

## Consequences

- Reload-resumable status without exposing Firestore to the browser or building any
  real client-side auth story.
- Every event replays the full current object rather than an incremental diff —
  simpler to reason about (idempotent on the client), at the cost of slightly more
  bytes per frame. Fine at this app's data sizes.
- Tied to single-process deployment, as noted above — a documented, not accidental,
  limitation.
