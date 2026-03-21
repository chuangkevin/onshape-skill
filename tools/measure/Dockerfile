# ---------- build & runtime ----------
FROM node:22-bookworm-slim

# Python 3 + OpenCV (headless) + numpy
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        libgl1 libglib2.0-0 && \
    pip3 install --no-cache-dir --break-system-packages \
        opencv-python-headless>=4.10.0 \
        numpy>=1.26.0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PYTHON_PATH=/usr/bin/python3

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

EXPOSE 8123

ENV PORT=8123
CMD ["node", "--import", "tsx", "src/server/index.ts"]
