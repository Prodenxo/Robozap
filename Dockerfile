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

# Install FFmpeg
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
