#!/usr/bin/env bash
set -euo pipefail

# Deploys the backend to Cloud Run and the frontend to Firebase Hosting, both
# in the same GCP project (silent-scholar-505618-u6). See docs/adr/0011 for
# why this split, and the one-time setup this script assumes is already done.
#
# Run from anywhere: bash scripts/deploy.sh

cd "$(dirname "${BASH_SOURCE[0]}")/.."  # repo root

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-silent-scholar-505618-u6}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-film-transcreation-backend}"

echo "==> Checking required tools..."
command -v gcloud >/dev/null || {
  echo "gcloud CLI not found — https://cloud.google.com/sdk/docs/install"
  exit 1
}
command -v firebase >/dev/null || {
  echo "firebase CLI not found — run: npm install -g firebase-tools"
  exit 1
}

if [ ! -f backend/.env ]; then
  echo "backend/.env not found. Copy backend/.env.example to backend/.env and"
  echo "set a real SHARED_PASSCODE before deploying."
  exit 1
fi

SHARED_PASSCODE=$(grep '^SHARED_PASSCODE=' backend/.env | cut -d '=' -f2-)
if [ -z "$SHARED_PASSCODE" ] || [ "$SHARED_PASSCODE" = "change-me-for-local-dev" ]; then
  echo "SHARED_PASSCODE in backend/.env is missing or still the placeholder value."
  echo "Set a real passcode before deploying a public URL."
  exit 1
fi

echo "==> Deploying backend to Cloud Run"
echo "    service: $SERVICE_NAME   project: $PROJECT_ID   region: $REGION"
gcloud run deploy "$SERVICE_NAME" \
  --source backend \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "SHARED_PASSCODE=${SHARED_PASSCODE}"

BACKEND_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')

echo "==> Backend deployed: $BACKEND_URL"

echo "==> Building frontend against that backend URL..."
(cd frontend && VITE_BACKEND_URL="$BACKEND_URL" npm run build)

echo "==> Deploying frontend to Firebase Hosting"
firebase deploy --only hosting --project "$PROJECT_ID"

echo ""
echo "==> Done."
echo "Backend:  $BACKEND_URL"
echo "Frontend: see the Hosting URL firebase just printed above."
echo ""
echo "Reminder: docs/runbook.md has the pre-judging safety checklist"
echo "(budget alert, passcode, tear-down plan) — do that before sharing the link."
