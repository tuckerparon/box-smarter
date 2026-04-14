#!/bin/bash
set -e

cd "$(dirname "$0")/backend"

gcloud run deploy boxsmart-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account boxsmart-backend@boxsmart-492022.iam.gserviceaccount.com \
  --set-env-vars LOG_PASSWORD=woodbury5 \
  --set-secrets WHOOP_CLIENT_ID=WHOOP_CLIENT_ID:latest,WHOOP_CLIENT_SECRET=WHOOP_CLIENT_SECRET:latest,WHOOP_REDIRECT_URI=WHOOP_REDIRECT_URI:latest,WHOOP_REFRESH_TOKEN=WHOOP_REFRESH_TOKEN:latest \
  --timeout 300 \
  --memory 1Gi \
  --project boxsmart-492022

echo "Deploy complete."
