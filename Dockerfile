# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Install dependencies for building
COPY package*.json ./
COPY prisma ./prisma
RUN npm install

# Copy source and build
COPY . .
RUN npm run build
RUN npx prisma generate

# Production stage
FROM node:18-slim

WORKDIR /app

# Install FFmpeg and clean up
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Script to run migrations before starting
CMD npx prisma migrate deploy && npm start
