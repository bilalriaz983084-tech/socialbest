FROM node:22-bullseye-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instaloader aur yt-dlp dono install karein
RUN pip3 install --no-cache-dir instaloader
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm install --omit=dev --no-audit

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
