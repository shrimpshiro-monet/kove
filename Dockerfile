# Dockerfile
FROM python:3.11-slim AS base

# system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-dejavu fonts-liberation curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# node for editly
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs && npm i -g editly

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY monet ./monet
COPY pyproject.toml ./

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "monet.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
