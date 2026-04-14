# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

# ---------- runtime stage ----------
FROM node:22-bookworm-slim

# Python 3 + OpenCV headless + ffmpeg (for video frame extraction)
# Use a venv to avoid Debian's externally-managed-environment restrictions
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        python3 python3-pip python3-venv \
        libgl1 libglib2.0-0 \
        ffmpeg && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir \
        opencv-python-headless \
        numpy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PYTHON_PATH=/opt/venv/bin/python3

WORKDIR /app

# Install only production Node dependencies + tsx for runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i --save-dev tsx typescript

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy server source and python scripts
COPY src/server ./src/server
COPY src/shared ./src/shared

# Persistent data lives in a volume (includes DB, uploads, frames, videos)
RUN mkdir -p /app/data/frames /app/data/videos

EXPOSE 6123

ENV PORT=6123
CMD ["node", "--import", "tsx", "src/server/index.ts"]
