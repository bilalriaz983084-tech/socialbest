FROM node:20-bullseye-slim

# System level tools install (FFmpeg, Python, aur build dependencies)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies copy aur install
COPY package*.json ./
RUN npm install --production

# Saara code aur routes copy
COPY . .

# Server port expose
ENV PORT=3000
EXPOSE 3000

# Start Express Server
CMD ["node", "server.js"]
