# 0029. Frontend test-mode default flipped to off

Status: Accepted

## Context

0010 defaulted "Test mode" to **on** so the app is usable immediately after a
clone, with no GCP setup or quota spend. It explicitly warned about the
trade-off: *"the real demo moment requires remembering to uncheck the box"* —
easy to forget live, and a real risk when handing the app to a hackathon judge
who won't know the checkbox exists.

For the hackathon submission, showing mocked/canned output by default is
worse than the onboarding-friction problem 0010 was solving for: a judge's
first impression should be the real Discover → Research pipeline, not fixed
sample data.

## Decision

`useTestMode`'s default (`frontend/src/utils/useTestMode.ts`) is flipped: a
browser with no stored `testMode` value now defaults to `false` (real
pipeline) instead of `true` (mock).

The backend's own safety net from 0010 is **unchanged and still load-bearing**:
every route (`films.ts`, `projects.ts`, `discoveryChat.ts`, `projectChat.ts`)
still treats an *omitted* `testMode` field as mock (`testMode !== false`). A
caller that forgets to send the flag entirely — a test, a script, a future
client — still can't accidentally hit the real paid API. Only the frontend's
own stored default changed; it now sends `testMode: false` explicitly rather
than omitting it.

## Consequences

- First-time visitors (including judges, and anyone re-cloning the repo) now
  hit the real Gemini/Vertex + Parallel pipeline by default, which requires
  valid ADC (0003) and spends real quota per run.
- Someone iterating locally without GCP access now needs to manually check
  "Test mode" rather than manually unchecking it — the friction 0010 removed
  is back for that workflow, traded deliberately for a truthful default demo.
- Anyone who already has a stored `testMode` value in their browser's
  localStorage from before this change keeps their existing value; this only
  changes the *first-visit* default.
