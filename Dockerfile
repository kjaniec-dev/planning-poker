# Stage 1: Dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Install only production dependencies for smaller image
COPY package.json package-lock.json* ./
COPY servers/node/package.json servers/node/package-lock.json* ./servers/node/

RUN npm ci
RUN npm --prefix servers/node ci


# Stage 2: Builder (Standalone mode for external)
FROM node:24-alpine AS builder-standalone
WORKDIR /app

ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/servers/node/node_modules ./servers/node/node_modules

COPY . .

# Build with standalone output enabled (for external mode)
RUN npm run build


# Stage 3: Builder (Non-standalone for embedded)
FROM node:24-alpine AS builder-embedded
WORKDIR /app

ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/servers/node/node_modules ./servers/node/node_modules

COPY . .

# Disable standalone output for embedded mode (needs custom server with full dependencies)
RUN sed -i.bak 's/output: "standalone",/\/\/ output: "standalone",/' next.config.ts

# Build without standalone
RUN npm run build


# Stage 4: Production (Standalone mode - for external)
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS production-standalone

WORKDIR /app

# Copy standalone build (minimal runtime) - includes generated server.js
COPY --from=builder-standalone --chown=nonroot:nonroot /app/.next/standalone ./

# Copy static assets and public folder
COPY --from=builder-standalone --chown=nonroot:nonroot /app/.next ./.next
COPY --from=builder-standalone --chown=nonroot:nonroot /app/public ./public

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NODE_OPTIONS="--max-old-space-size=2048"

USER nonroot
EXPOSE 3000

# Use the generated standalone server (no WebSocket, that runs in separate container)
CMD ["server.js"]


# Stage 5: Production (Non-standalone - for embedded mode with custom server)
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS production-embedded

WORKDIR /app

# Copy full node_modules (needed for custom server without standalone)
COPY --from=deps --chown=nonroot:nonroot /app/node_modules ./node_modules

# Copy Next.js build output
COPY --from=builder-embedded --chown=nonroot:nonroot /app/.next ./.next
COPY --from=builder-embedded --chown=nonroot:nonroot /app/public ./public

# Copy Node WebSocket server
COPY --from=builder-embedded --chown=nonroot:nonroot /app/servers/node/dist ./servers/node/dist
COPY --from=deps --chown=nonroot:nonroot /app/servers/node/node_modules ./servers/node/node_modules
COPY --chown=nonroot:nonroot servers/node/package.json ./servers/node/

# Copy application files
COPY --chown=nonroot:nonroot next-server.js ./
COPY --chown=nonroot:nonroot package.json ./

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NODE_OPTIONS="--max-old-space-size=2048"

USER nonroot
EXPOSE 3000

CMD ["next-server.js"]