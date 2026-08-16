# docs/

- **`adr/`** — architecture decision records. One file per decision, numbered in the
  order made. Read before changing anything architectural; add a new ADR (don't
  silently deviate) if a decision changes — see
  [0002](adr/0002-dialogflow-cx-detect-intent-api-surface.md) for an example of a
  decision that got superseded once real information arrived.
- **`product/`** — the business/product context: the pitch, the user story,
  acceptance criteria. What we're building and why it matters, as distinct from how.
- **`progress/`** — one file per work session, `YYYYMMDD-HHMMSS.md`. See
  [CLAUDE.md](../CLAUDE.md) for the logging mechanism.
- **`runbook.md`** — operational checklist, currently just the pre-judging safety
  checklist for the deployed demo.
