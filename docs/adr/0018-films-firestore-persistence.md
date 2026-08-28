# 0018. Films: Firestore persistence, superseding the file-backed store

Status: Accepted (supersedes 0016)

## Context

The Login → Import → Prep → Details-workspace redesign (see the 2026-08-28 progress
entries) needs real durable state that 0016's single flat JSON file can't reasonably
support: a multi-stage async prep pipeline whose progress must survive a page
reload/navigation, and a queue of multi-pass Discovery agent jobs (each with its own
log, results, and persisted Gemini conversation history) that also must survive
reload/navigation and can be resumed with a user comment hours later. 0016's rewrite-
the-whole-file-on-every-mutation approach has no real notion of sub-resources
(detail rows, columns, discovery jobs) or of a background worker safely claiming one
job at a time.

There's still only one local user driving this app, so the original "no real product
need for a hosted database" framing from 0013/0016 doesn't change on its own — what
changed is that this feature now has actual multi-writer, must-survive-reload
requirements a single JSON file can't satisfy, not a general upgrade for its own sake.
The user explicitly authorized moving onto real GCP infrastructure for this.

## Decision

**Firestore, Native mode, single database, `us-central1`** (matches `geminiLocation`
and the GCS bucket region). Uses `@google-cloud/firestore` directly (bare client, ADC),
mirroring the existing `new Storage()` pattern in `videoBucketUploader.ts` rather than
pulling in the heavier `firebase-admin` package.

**Collections**:
- `films/{filmId}` — the film record itself (title, videoUrl, subtitle + its parsed
  entries, prep state/log, status). See `backend/src/services/filmTypes.ts`.
- `films/{filmId}/detailRows/{rowId}` — the Details table's rows, a subcollection
  (not an embedded array) because rows get frequent independent CRUD and unbounded
  growth.
- `films/{filmId}/columns/{columnId}` — only *custom* user-added columns; the three
  wireframe-fixed columns (Segment Description, Gesture, Notes) are shared constants,
  not per-film documents.
- `films/{filmId}/discoveryJobs/{jobId}` — one document per agent "pass," including
  its log, result rows, and the full persisted Gemini `contents` conversation history
  (see 0019 for why that's what makes a comment-driven re-run remember context).
  `status: 'queued'` on the job itself **is** the work queue — no separate queue
  collection — the worker claims across every film via a `collectionGroup` query
  (see `discoveryJobStore.ts`'s `claimNextQueuedJob`), so passes queue and drain in
  one global FIFO order regardless of which film they belong to.

**`filmStore.ts` keeps its old exported `FilmStore` interface shape** (so the DI seam
in `app.ts`/`server.ts` didn't need to change), but every method is now `Promise`-
returning. `createFirestoreFilmStore(firestore)` is the real implementation;
`createInMemoryFilmStore(seedFilms?)` is an in-memory fake with identical semantics,
used by every test — Firestore is exactly the kind of external Google client CLAUDE.md
allows faking. `detailRowsStore.ts` and `discoveryJobStore.ts` follow the identical
`createFirestore...`/`createInMemory...` pattern.

**`createApp()`'s own default, when a store isn't injected, is now an in-memory fake**
(previously it built a working file-backed store with seed data) — matching how every
other real-Google-backed service in this app (`captioningClient`, `researchAgent`,
`videoBucketUploader`) already defaults to a `notConfigured`-style stub rather than
silently working without credentials. `server.ts` is the only place that constructs
the real Firestore-backed stores.

**No seed film anymore.** The old `INSIDE_OUT_DETAILS` fixture only made sense against
the retired `FilmDetail`/fixture-based "Discovery" shape (0012) — the app now starts
with zero films in a fresh Firestore database, same as it already does for projects.

## Consequences

- `projectStore.ts` is **explicitly not migrated** — still in-memory only, per 0013.
  Nothing about this feature requires projects to survive a restart or reload; moving
  it now would be scope creep with no consumer-facing requirement behind it. Revisit
  only if a real need shows up later.
- A single Firestore database with no per-user security rules (see 0020's rules
  file, which denies all direct client access) — every read/write goes through this
  backend's own ADC identity. This matches the app's existing "Google credentials
  never touch the browser" posture (0003/0005).
- Firestore's collection-group query for job claiming needs a composite index
  (`status ASC, createdAt ASC`), predefined in `firestore.indexes.json` and deployed
  via `firebase deploy --only firestore:indexes` rather than relying on the runtime
  console-link error the first time the query runs unindexed.
- `DELETE /api/films/:id` now recursively deletes every subcollection
  (`firestore.recursiveDelete`) — cascading delete that the old flat-array store
  never needed to think about.
