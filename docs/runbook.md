# Runbook: demo safety checklist

Operational half of [0008](adr/0008-operational-safety-guardrails.md) — do these
before sharing the deployed URL with judges.

## Before deploying for judging

- [ ] Set a GCP budget alert on `silent-scholar-505618-u6` (Billing → Budgets &
      alerts). This is the ceiling of last resort if every other control fails.
- [ ] Confirm `SHARED_PASSCODE` is set in the proxy's deployed environment and is not
      the placeholder/dev value.
- [ ] Confirm `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` are set to sane values (not
      disabled).
- [ ] Confirm `MAX_SCRIPT_LINES` is set (rejects oversized submissions before they
      reach Dialogflow CX).
- [ ] Note the deploy time — plan to tear down the Cloud Run service (or scale to
      zero) after the judging window closes.

## During judging

- [ ] Share the passcode only in the Devpost submission text, not more broadly.

## After judging

- [ ] Tear down / scale to zero the Cloud Run proxy.
- [ ] Check the GCP billing dashboard for actual spend vs. the budget alert.
