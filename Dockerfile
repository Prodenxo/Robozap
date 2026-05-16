# Build stage
FROM node:20 AS builder

WORKDIR /app

# Install dependencies for building
COPY package*.json ./
COPY prisma ./prisma

# Dummy DATABASE_URL for prisma generate during build
ENV DATABASE_URL="mysql://root:password@localhost:3306/db"

RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install FFmpeg, Python, Curl and Deno (for YouTube JavaScript extraction)
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip curl unzip && \
    curl -fsSL https://deno.land/install.sh | sh && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Add Deno to PATH
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Copy from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD sh -c "npx prisma db push --accept-data-loss || echo '[ROBOZAP] prisma db push falhou, subindo mesmo assim'; exec npm start"
