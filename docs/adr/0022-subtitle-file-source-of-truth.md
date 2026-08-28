# 0022. Parsed subtitle file is the source of truth for Timestamp/Subtitle

Status: Accepted

## Context

The wireframe's Details table lets a user edit a row's Timestamp/Subtitle, but is
explicit that those two fields must be picked from the film's actual subtitle file,
not freely typed — otherwise a row could reference a timestamp or line that was never
actually said in the film. Prior to this, film creation collected a plain `script`
text field (later dropped entirely, see `docs/progress/20260827.md`), with no
timestamp structure at all.

## Decision

**Film creation now requires a real timestamped subtitle file (SRT or VTT), uploaded
and parsed before the film exists.** `POST /api/films/upload-subtitle` (multipart,
mirrors the existing `upload-video` multer pattern) accepts a `.srt`/`.vtt` file,
parses it server-side via `backend/src/services/subtitleParser.ts` into
`SubtitleEntry[]` (`id`, `index`, `startMs`, `endMs`, `text`), and returns the parsed
entries alongside the uploaded file's `gs://` URL. `POST /api/films` then requires
`subtitleUrl`/`subtitleFormat`/`subtitleEntries` (all non-empty) — a film cannot be
created without a successfully parsed subtitle file.

**Every `DetailRow` stores `subtitleEntryId`, an FK into `film.subtitle.entries`**,
plus denormalized `timestamp`/`subtitleText` display copies kept in sync whenever
`subtitleEntryId` changes (`detailRowsStore.ts`'s `updateRow`). The backend validates
`subtitleEntryId` against the film's actual entries on every create/update of a row
(`routes/films.ts`) — the server-side half of the constraint. The UI half
(`DetailsTable.tsx`, a future phase) renders Timestamp/Subtitle as a `<select>`
constrained to the parsed entries rather than free-text inputs.

**The SRT/VTT parser is hand-rolled**, not a new npm dependency — both formats share
the same "timing line + text lines" cue-block shape once VTT's `WEBVTT` header is
stripped, so `subtitleParser.ts` parses both through one shared scan
(`parseSrt`/`parseVtt` are now thin wrappers).

## Consequences

- A film with no subtitle file cannot be created at all — this is a hard requirement,
  not an optional enhancement, reversing the earlier decision to drop script
  collection from film creation.
- Every Discovery agent pass anchors its findings to a `subtitleEntryId` too (0019),
  so the "must reference something real" constraint applies uniformly whether a row
  came from a human or the agent.
- Re-timing or fixing a typo in the subtitle file after a film is created isn't
  supported — the parsed entries are fixed at creation time. Not needed for this
  pass; would require a "re-upload subtitle" flow if it ever comes up.
