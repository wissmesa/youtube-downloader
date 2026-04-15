FROM node:18-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv && \
    python3 -m pip install --break-system-packages yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --production

COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install

COPY . .

RUN cd client && npm run build

ENV PORT=3001

CMD ["node", "server/index.js"]
