"""
Shared GCP clients.
Credentials are picked up automatically from GOOGLE_APPLICATION_CREDENTIALS.
"""
from google.cloud import bigquery, storage

PROJECT = "boxsmart-492022"
DATASET = "boxsmart"
GCS_BUCKET = "boxsmart-raw"

bq = bigquery.Client(project=PROJECT)
gcs = storage.Client(project=PROJECT)
bucket = gcs.bucket(GCS_BUCKET)
