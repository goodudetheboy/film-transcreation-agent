# 0005. Proxy responsibilities: passcode, rate limit, relay — nothing more

Status: Accepted

## Context

The demo will be deployed at a public-ish URL for hackathon judging. Full user
accounts/login would add friction that actively hurts judging (judges won't sign up
to try a hackathon project) and doesn't address the actual risk, which is cost
blowup from bots/crawlers hitting a paid Google API, not "who is this person."

## Decision

The proxy does exactly four things, in order:
1. **Passcode check** — a shared secret (JSON body field, not a header — see
   "Passcode transport" in the scaffold plan) checked server-side. Not real auth —
   just a crawler/bot filter. Anyone with the code gets in; that's fine, the code is
   only ever shared with judges.
2. **Rate limit** — per-IP, via `express-rate-limit`.
3. **Input size cap** — reject scripts over a configured max line count, so nobody can
   submit something huge and multiply Dialogflow call cost/latency.
4. **Relay** — call `dialogflowClient`, synthesize the SSE stream back (0006).

## Consequences

- No database, no sessions, no user model — the proxy stays stateless and simple.
- A GCP budget alert/cap should be set at the project level regardless (defense in
  depth, not code — see `docs/runbook.md`).
- IAP was considered and rejected for the public demo path — it requires a
  `gcloud`-based local proxy to reach, which locks out judges entirely.
