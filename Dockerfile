# Node 22 use kar rahe hain puppeteer/modern packages ke liye
FROM node:22-bullseye-slim

# System dependencies + python-is-python3 link fix
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies copy aur install
COPY package*.json ./
RUN npm install --omit=dev

# Application code copy
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
