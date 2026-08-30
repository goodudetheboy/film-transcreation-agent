# 0024. Real video uploads go straight to GCS, bypassing Cloud Run

Status: Accepted

## Context

A real ~450MB film upload failed with "Failed to fetch" against the deployed
Cloud Run backend. Diagnosed live: the same file uploaded fine (curl, and a real
browser `fetch()`) against the local backend, ruling out `maxVideoUploadBytes`,
multer, and basic connectivity. That left the deploy target itself. Google's
current docs confirm Cloud Run enforces a hard, **non-configurable 32 MiB limit**
on any HTTP/1.1 request carrying a `Content-Length` header ("cannot be
increased" per the quotas page). A `fetch()` with a `FormData` body containing a
`File` always sets `Content-Length`, so any video over 32MB is rejected by
Google's front-end proxy before the app ever sees it — the browser experiences
this as a hard connection failure, not a clean HTTP error. This applies
regardless of mock/real mode, since it's the *incoming request* that's rejected.

`docs/adr/0011` already put the backend on Cloud Run; this ADR doesn't revisit
that, only how large binary uploads must route around one of its hard limits.

Two ways to keep the video bytes off Cloud Run were considered:

- **V4 signed URLs**: the conventional pattern, but signing requires either a
  service-account private key or the IAM `signBlob` API (a new
  `roles/iam.serviceAccountTokenCreator` grant on the Cloud Run service
  account) — a real deviation from `docs/adr/0003`'s "auth via ADC, not keys."
- **GCS resumable-upload sessions**: the backend calls
  `bucket.file(name).createResumableUpload()` using the *existing* bucket-write
  access `uploadBuffer`/`uploadFromUrl` already use via ADC. No new IAM grant.

## Decision

- **Real (non-mock) video uploads**: the frontend calls a new
  `POST /api/films/upload-video/init` (a small JSON request, filename/size/
  content-type only — nowhere near 32MB) which mints a GCS resumable-upload
  session via `videoBucketUploader.createResumableUploadSession()`
  (`backend/src/services/videoBucketUploader.ts`) and returns the session's
  `uploadUrl` plus the eventual `gs://` URI (known upfront, since the object
  name is chosen before the upload completes). The browser then uploads the
  file **directly to `storage.googleapis.com`**, in 8MiB chunks
  (`frontend/src/api/resumableUpload.ts`, implementing Google's documented
  resumable-upload chunk protocol) — the video bytes never touch Cloud Run.
  A transient failure mid-transfer triggers a status-check request (GCS reports
  how many bytes it actually has) and resumes from that offset rather than
  restarting, up to 3 attempts per chunk. `ImportFilmModal.tsx` surfaces upload
  progress via a progress bar, driven by chunk-completion callbacks.
- **Mock mode is unchanged** — it still POSTs the file to the existing
  `POST /api/films/upload-video` (multer/diskStorage) route and saves it to
  local disk on the backend instance. It's for small test clips, not real
  films, so it stays subject to Cloud Run's 32MB ceiling when exercised against
  a deployed backend. Only the real path needed the fix.
- **"Resumable" is scoped to within one upload attempt.** A wifi blip mid-
  transfer resumes from the last confirmed byte; closing the tab and resuming
  the next day does not — that would need persisting session state (URL,
  object name, byte offset) across reloads, which wasn't needed to fix the
  reported failure and adds real complexity (abandoned-session handling,
  staleness, etc.). Can be revisited if it becomes a real pain point.
- `MAX_VIDEO_UPLOAD_BYTES` default bumped from 500MB to 2GB
  (`backend/src/config/env.ts`) — this is an app-level policy limit (still
  enforced by the new `init` route), not the platform limit that caused the
  bug; the old default was already below what the code's own comments claimed
  to support ("hundreds of MB to a few GB").

## Consequences

- **New one-time infra step**: the video bucket needs a CORS policy allowing
  `PUT` from the frontend's origin(s), since the browser now talks to
  `storage.googleapis.com` directly. Documented in `docs/runbook.md` next to
  the existing Dialogflow/Vertex AI IAM steps, and deliberately kept manual
  (not scripted into `scripts/deploy.sh`) — same reasoning `0011` already gave
  for not scripting IAM changes: infra changes should be run by a human who
  sees them happen, not folded into a routine deploy.
- Backend no longer buffers or streams real video bytes at all for the new
  path (no more `readFile(file.path)` into memory before the GCS write) — a
  further reduction in Cloud Run memory pressure beyond the diskStorage switch
  already made for mock mode.
- Adds a second upload code path (mock vs. real) to reason about in
  `filmsApiClient.ts` and `films.ts`, rather than one route branching
  internally — a deliberate tradeoff, since the two paths now have genuinely
  different mechanics (multipart-through-the-app vs. chunked-direct-to-GCS),
  not just different backends for the same mechanics.
- If uploads to a *different* GCP project/bucket are ever needed (e.g. a judge
  running their own deploy), the CORS step above must be repeated for that
  bucket — not automated by this change.

## Update: GCS's completing response never carries CORS headers — added a backend finalize step

Live-verifying the above against the real bucket (after applying the CORS
policy and confirming it via `curl`'s OPTIONS preflight) still failed with
"Failed to fetch" — but only ever *very late*, consistently around the last
chunk. Reproduced deterministically with per-chunk logging in a real browser:
every intermediate `308 Resume Incomplete` response carried a correct
`Access-Control-Allow-Origin` header; the completing `200` response never did.
Confirmed directly with `curl` (Origin header set manually, bypassing the
browser's own enforcement to just inspect what GCS sends): the finalizing PUT's
200 response has no CORS headers at all, and neither does a subsequent
status-check (`Content-Range: bytes */total`) against an already-completed
object. This is a genuine, undocumented GCS platform behavior, not a
misconfiguration — a browser's `fetch()` can never successfully read
confirmation of a resumable upload's own completion, whether the upload
actually succeeded or not. (An earlier direct-from-Node test had appeared to
prove the chunk protocol worked end-to-end, but Node's `fetch` doesn't send an
`Origin` header at all — it couldn't have hit this, so it never actually
exercised the thing that was broken.)

Fix: stop trying to read the browser's own confirmation of the final chunk.
- `frontend/src/api/resumableUpload.ts`: a thrown error on the *final* chunk
  specifically is now treated as expected, not fatal — the bytes are sent
  either way; the function just resolves. (Intermediate chunks keep their real
  retry-and-resume behavior; only the terminal request's response is
  known-unreadable.)
- New `POST /api/films/upload-video/finalize`: after the browser finishes
  sending bytes, `filmsApiClient.uploadVideoFile` calls this route, which
  independently checks the object's real GCS metadata
  (`videoBucketUploader.getObjectSizeBytes()`, added alongside `deleteObject()`)
  — unaffected by browser CORS since it's a server-to-server call. This is also
  where the real size cap is enforced: the client declares a size at `/init`
  time, but nothing stops it lying, since GCS itself doesn't cap a resumable
  session's total from what was declared at creation — `/finalize` checks the
  *actual* uploaded size against `maxVideoUploadBytes` and deletes the object
  if it's over, closing that gap rather than trusting the client's word.
- Re-verified against the real bucket end-to-end via the actual browser
  `uploadVideoFile` call (not Node): full progress to 100%, clean
  `{ videoUrl }` result, object confirmed byte-perfect in the bucket.
