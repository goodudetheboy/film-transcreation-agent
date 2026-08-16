# User story

> As a localization specialist, I want to submit a short script with a target
> country, and get back a ranked list of lines that are unlikely to land there, each
> with a plain-English reason and a suggested replacement, so I can review just those
> lines instead of reading the whole script.

## Pipeline (as sketched)

```
Script ─┐
        ├─▶ Agent ("find list of lines, reason why, suggested replacement") ─┬─▶ list of lines (unlikely to land)
Country ─┘                                                                    ├─▶ reason why
                                                                               └─▶ suggested replacements
```

## Acceptance criteria

- TODO: fill in once the real Dialogflow CX response schema is confirmed (see
  [0002](../adr/0002-dialogflow-cx-detect-intent-api-surface.md) — currently
  provisional, inferred only from `test_agent.py`'s generic `json.loads`).

## Edge cases to define

- TODO: empty script, script exceeding `MAX_SCRIPT_LINES`, zero flagged lines
  (fully-cleared script), Dialogflow CX call failure/timeout.
