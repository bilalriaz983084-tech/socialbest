FROM node:22-bullseye-slim

# System tools, python aur ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Official yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Heavy puppeteer download skip karne ka flag (RAM crash se bachata hai)
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm install --omit=dev --no-audit

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
