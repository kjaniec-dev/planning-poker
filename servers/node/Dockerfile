# Stage 1: Dependencies
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev


# Stage 2: Builder
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build


# Stage 3: Production runner using Chainguard secure base image
# Chainguard images are distroless-equivalent with latest Node.js versions
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy package.json for module resolution
COPY --chown=node:node package.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Run as non-root user (Chainguard default is 'node' user)
USER node

EXPOSE 3001

# Use node directly (no shell in Chainguard images)
CMD ["dist/index.js"]
