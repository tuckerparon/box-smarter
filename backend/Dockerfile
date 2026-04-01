FROM python:3.11-slim

WORKDIR /app

# Install dependencies (cached layer — only rebuilds if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source (no data files — those live in GCS/BigQuery)
COPY auth.py gcp.py main.py export_static.py ./
COPY routers/ routers/
COPY processing/ processing/
COPY db/ db/

# Cloud Run injects PORT=8080
ENV PORT=8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
