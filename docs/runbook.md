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
- [ ] Confirm the **Vertex AI API** (`aiplatform.googleapis.com`) is enabled on the
      project — Dialogflow CX and Vertex AI are different APIs, so this may not be
      on by default even if Dialogflow already works.
- [ ] Grant the Cloud Run service's default compute service account the
      **Vertex AI User** role (`roles/aiplatform.user`) — this is what lets the
      Research agent (`docs/adr/0012`) call Gemini via `@google/genai` in
      production. Without it, real (non-test-mode) research requests will fail the
      same way real analyze requests do without the Dialogflow role above.
- [ ] Configure CORS on the video clips bucket (`silent-scholar-505618-u6-clips`
      by default — `VIDEO_CLIPS_BUCKET`) so the browser can `PUT` directly to
      `storage.googleapis.com` for real (non-mock) video uploads — see
      `docs/adr/0024-direct-to-gcs-video-uploads.md`. Without this, the browser's
      direct-to-GCS upload fails as a CORS error instead of a clean response.
      One-time, run after the first Firebase Hosting deploy (so the hosting URL
      is known):
      ```bash
      cat > /tmp/gcs-cors.json <<'EOF'
      [
        {
          "origin": ["https://silent-scholar-505618-u6.web.app", "http://localhost:5173"],
          "method": ["PUT"],
          "responseHeader": ["Content-Type", "Content-Range", "x-goog-resumable"],
          "maxAgeSeconds": 3600
        }
      ]
      EOF
      gcloud storage buckets update gs://silent-scholar-505618-u6-clips --cors-file=/tmp/gcs-cors.json
      ```
      Safe to re-run any time (it replaces the bucket's CORS config wholesale,
      not additive) — add any additional preview/custom-domain origins to the
      `origin` array as needed.

## One-time setup for GitHub Actions auto-deploy (optional)

Only needed if you want `.github/workflows/deploy.yml` to deploy automatically on
push to `main`, instead of running `scripts/deploy.sh` by hand. Uses **Workload
Identity Federation (WIF)** — GitHub proves its identity to GCP per-run and gets a
short-lived token; no long-lived key is ever created, stored, or downloaded.

```bash
PROJECT_ID="silent-scholar-505618-u6"
REPO="goodudetheboy/film-transcreation-agent"

# 1. Get the project number (needed for the WIF provider's resource path below)
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "$PROJECT_NUMBER"   # note this down

# 2. Create the deploy service account (no key created for it — that's the point)
gcloud iam service-accounts create gh-actions-deploy \
  --project "$PROJECT_ID" \
  --display-name "GitHub Actions deploy"

SA_EMAIL="gh-actions-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/iam.serviceAccountUser \
            roles/cloudbuild.builds.editor roles/artifactregistry.admin \
            roles/storage.admin roles/firebasehosting.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SA_EMAIL}" --role "$ROLE"
done

# 3. Create the Workload Identity Pool
gcloud iam workload-identity-pools create "github" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 4. Create the OIDC provider — attribute-condition restricts this to ONLY
#    workflow runs from this exact repo, nothing else can impersonate the SA
gcloud iam workload-identity-pools providers create-oidc "film-transcreation-agent" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github" \
  --display-name="film-transcreation-agent repo" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 5. Allow that provider to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"
```

Then, in the GitHub repo (Settings → Secrets and variables → Actions):
- [ ] Under **Variables** (not Secrets — these aren't sensitive):
  - `WORKLOAD_IDENTITY_PROVIDER` =
    `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/film-transcreation-agent`
    (substitute the real `PROJECT_NUMBER` from step 1)
  - `GCP_SERVICE_ACCOUNT` = `gh-actions-deploy@silent-scholar-505618-u6.iam.gserviceaccount.com`
- [ ] Under **Secrets**:
  - `SHARED_PASSCODE` — the real passcode (same value as `backend/.env`).

No `GCP_SA_KEY` needed at all — that's the whole point of WIF. Allow ~5 minutes
after step 3/4 for the pool/provider to propagate before the first workflow run.

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
