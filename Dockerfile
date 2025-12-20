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


# Stage 3: Production runner using Docker Hardened Images (DHI)
# DHI images are pre-hardened with security best practices built-in
FROM dhi.io/node:24-alpine3.22

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
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NODE_OPTIONS="--max-old-space-size=2048"

# DHI images already run as non-root user 'node'
USER node

EXPOSE 3000

# DHI images include dumb-init by default
CMD ["node", "next-server.js"]
