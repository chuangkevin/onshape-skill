# ---------- build & runtime ----------
FROM node:22-bookworm-slim

# Python 3 + OpenCV (headless) + numpy
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        libgl1 libglib2.0-0 && \
    pip3 install --no-cache-dir --break-system-packages \
        opencv-python-headless>=4.10.0 \
        numpy>=1.26.0 \
        ultralytics scipy beautifulsoup4 requests && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Pre-download FastSAM-s model (~23MB) so it's baked into the image
RUN mkdir -p /app/models && \
    python3 -c "from ultralytics import FastSAM; FastSAM('FastSAM-s.pt')" && \
    find / -name "FastSAM-s.pt" 2>/dev/null -exec cp {} /app/models/FastSAM-s.pt \; || \
    echo "FastSAM model will download on first use"

ENV PYTHON_PATH=/usr/bin/python3
ENV FASTSAM_MODEL_PATH=/app/models/FastSAM-s.pt

WORKDIR /app

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm i --save-dev vite tsx typescript

# Copy source
COPY . .

# Build frontend
RUN npx vite build

# Persistent data lives in a volume
RUN mkdir -p /app/data

EXPOSE 6123

ENV PORT=6123
CMD ["node", "--import", "tsx", "src/server/index.ts"]
