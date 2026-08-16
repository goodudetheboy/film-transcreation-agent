# Runbook: demo safety checklist

Operational half of [0008](adr/0008-operational-safety-guardrails.md) — do these
before sharing the deployed URL with judges. See [0011](adr/0011-deploy-cloud-run-firebase-hosting.md)
for how the deploy itself works (`scripts/deploy.sh`).

## One-time setup (before the first deploy)

- [ ] `gcloud auth login` (deploy permissions — different from the
      `application-default login` used for local dev ADC).
- [ ] `npm install -g firebase-tools` then `firebase login`.
- [ ] Confirm Firebase is enabled on `silent-scholar-505618-u6` (Firebase console,
      or `firebase projects:addfirebase silent-scholar-505618-u6`).
- [ ] Confirm the Cloud Run and Cloud Build APIs are enabled on the project (gcloud
      prompts to enable them on first deploy if not).
- [ ] Grant the Cloud Run service's default compute service account the
      **Dialogflow API Client** role on the project — this is the deployed
      equivalent of local ADC login. Without it, real (non-test-mode) requests
      will fail in production the same way they do locally without
      `gcloud auth application-default login`.

## One-time setup for GitHub Actions auto-deploy (optional)

Only needed if you want `.github/workflows/deploy.yml` to deploy automatically on
push to `main`, instead of running `scripts/deploy.sh` by hand.

```bash
gcloud iam service-accounts create gh-actions-deploy \
  --project silent-scholar-505618-u6 \
  --display-name "GitHub Actions deploy"

SA_EMAIL="gh-actions-deploy@silent-scholar-505618-u6.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/iam.serviceAccountUser \
            roles/cloudbuild.builds.editor roles/artifactregistry.admin \
            roles/storage.admin roles/firebasehosting.admin; do
  gcloud projects add-iam-policy-binding silent-scholar-505618-u6 \
    --member "serviceAccount:${SA_EMAIL}" --role "$ROLE"
done

gcloud iam service-accounts keys create gh-actions-deploy-key.json \
  --iam-account "$SA_EMAIL"
```

Then, in the GitHub repo (Settings → Secrets and variables → Actions):
- [ ] `GCP_SA_KEY` — the full contents of `gh-actions-deploy-key.json`.
- [ ] `SHARED_PASSCODE` — the real passcode (same value as `backend/.env`).

**Delete `gh-actions-deploy-key.json` locally once it's pasted into the GitHub
secret** — it's a real credential and shouldn't sit on disk or get committed.

## Before deploying for judging

- [ ] Set a GCP budget alert on `silent-scholar-505618-u6` (Billing → Budgets &
      alerts). This is the ceiling of last resort if every other control fails.
- [ ] Confirm `SHARED_PASSCODE` is set in the backend's deployed environment and is
      not the placeholder/dev value.
- [ ] Confirm `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` are set to sane values (not
      disabled).
- [ ] Confirm `MAX_SCRIPT_LINES` is set (rejects oversized submissions before they
      reach Dialogflow CX).
- [ ] Note the deploy time — plan to tear down the Cloud Run service (or scale to
      zero) after the judging window closes.

## During judging

- [ ] Share the passcode only in the Devpost submission text, not more broadly.

## After judging

- [ ] Tear down / scale to zero the Cloud Run backend.
- [ ] Check the GCP billing dashboard for actual spend vs. the budget alert.
