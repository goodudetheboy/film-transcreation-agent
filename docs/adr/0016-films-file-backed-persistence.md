# 0016. Films: file-backed local persistence, plus delete

Status: Superseded by 0018

## Context

0013 established an implicit "no database, in-memory only" convention for this app's
stores (explicitly for `projectStore.ts`; `filmStore.ts` followed the same pattern
without its own ADR). That was fine while films were disposable test data, but the
user now actively creates films, runs Discover Agent preprocessing against them, and
expects both the film and its preprocessing output to survive a backend restart —
losing everything on every `tsx watch` reload made the feature unusable to actually
work with. There's still no real product need for a hosted database (single local
user, hackathon scope), so standing up Firestore is out of proportion to the problem.

## Decision

**`filmStore.ts` gains an optional file-backed persistence mode**, not a database.
`createFilmStore(mockDetails, seedFilms, persistPath?)` — when `persistPath` is
provided, every mutation (`createFilm`, `updatePreprocessing`, `deleteFilm`)
synchronously rewrites the full film list to that JSON file. On startup, if the file
already exists, its contents are loaded verbatim and `seedFilms` is ignored (seed data
only applies on a genuinely first run, so it never resurrects a film the user deleted).
`server.ts` wires this to `config.filmsDataFile` (default `.data/films.json`,
gitignored — dev-machine-local, not shared or synced); tests and any other caller that
omits `persistPath` get the previous pure in-memory behavior unchanged.

**Discover Agent output is now part of the film record**, not transient page state.
`Film` gained `preprocessing: { dialogue, gestures } | null`. A new
`POST /api/films/:id/preprocessing` saves the frontend's already-fetched captioning
result onto the film (the route itself doesn't call Gemini — `/api/preprocess-video`
still does that); `FilmDetailView` now hydrates its timeline from
`film.preprocessing` on load instead of always starting empty, so the output survives
navigating away and coming back or reloading the page.

**Films can now be deleted.** `DELETE /api/films/:id` (204, or 404 if unknown), with a
delete action on both the films list and the film detail page, since there's now
something worth being able to remove.

## Consequences

- A single flat JSON file, rewritten in full on every write, with no locking. Fine for
  one local user hitting the app from one browser; would need real
  concurrency/transaction handling before this could serve multiple simultaneous
  writers — not attempted here.
- `projectStore.ts` is untouched — projects still live in memory only, per 0013. If
  projects need the same treatment later, that's a separate decision, not implied by
  this one.
- Deleting a film does not cascade to any project already created from it (projects
  only copied the film's `details` at creation time, so they're unaffected either
  way) — orphaned project data was already possible before this ADR and remains
  unchanged.
