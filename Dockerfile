# Stage 1: Dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Install only production dependencies for smaller image
COPY package.json package-lock.json* ./
COPY servers/node/package.json servers/node/package-lock.json* ./servers/node/

RUN npm ci
RUN npm --prefix servers/node ci


# Stage 2: Builder
FROM node:24-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/servers/node/node_modules ./servers/node/node_modules

COPY . .

# Build Next.js application with standalone output
RUN npm run build


# Stage 3: Production runner using Chainguard secure base image
# Chainguard images are distroless-equivalent with latest Node.js versions
FROM cgr.dev/chainguard/node:latest-dev AS runner-base

# Stage 4: Final minimal runtime
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

# Copy standalone build (includes all necessary dependencies)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Copy Node WebSocket server (for embedded mode)
COPY --from=builder --chown=node:node /app/servers/node/dist ./servers/node/dist
COPY --from=deps --chown=node:node /app/servers/node/node_modules ./servers/node/node_modules
COPY --chown=node:node servers/node/package.json ./servers/node/

# Copy custom server for WebSocket integration
COPY --chown=node:node next-server.js ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run as non-root user (Chainguard default is 'node' user)
USER node

EXPOSE 3000

# Use node directly (no shell in distroless/Chainguard images)
CMD ["next-server.js"]
