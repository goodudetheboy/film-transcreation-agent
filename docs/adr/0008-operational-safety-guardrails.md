# 0008. Operational safety guardrails for the public demo

Status: Accepted

## Context

The demo deploys to a reachable URL for hackathon judging. Login is deliberately not
used (0005) as the primary control — the real risk is uncontrolled Google API cost
from bots/crawlers or accidental abuse, not unauthorized access to non-sensitive data.

## Decision

Layer defenses instead of relying on any single one:
- Passcode gate (0005) — filters casual crawlers/indexing.
- Per-IP rate limiting (0005).
- Input size cap on submitted scripts (0005).
- **GCP budget alert/cap on the project** — set manually in the console, not code;
  the ceiling of last resort.
- **Time-box the deployment** — spin the backend + frontend up for the judging window,
  tear down after, rather than leaving it running indefinitely.

See `docs/runbook.md` for the concrete checklist.

## Consequences

- None of this is "real" security — it's calibrated to the actual risk (cost, not
  data sensitivity) and the actual constraint (judges need frictionless access).
- If this becomes a real product post-hackathon, this ADR should be revisited —
  proper auth becomes worth its cost once real user data is involved.
