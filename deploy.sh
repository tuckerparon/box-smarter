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
  --project boxsmart-492022

echo "Deploy complete."
