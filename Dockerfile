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


# Stage 3: Hardened production runner using Alpine Linux
FROM node:24-alpine AS runner

WORKDIR /app

# Security hardening for Alpine
RUN apk --no-cache upgrade && \
    apk add --no-cache dumb-init && \
    # Remove unnecessary packages and clean cache
    rm -rf /var/cache/apk/* /tmp/* && \
    # Create non-root user with no login shell
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs -s /sbin/nologin && \
    # Set secure permissions
    chmod 755 /app && \
    chown -R nodejs:nodejs /app

# Copy standalone build (includes all necessary dependencies)
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Copy Node WebSocket server (for embedded mode)
COPY --from=builder --chown=nodejs:nodejs /app/servers/node/dist ./servers/node/dist
COPY --from=deps --chown=nodejs:nodejs /app/servers/node/node_modules ./servers/node/node_modules
COPY --chown=nodejs:nodejs servers/node/package.json ./servers/node/

# Copy custom server for WebSocket integration
COPY --chown=nodejs:nodejs next-server.js ./

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NODE_OPTIONS="--max-old-space-size=2048"

# Run as non-root user
USER nodejs

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "next-server.js"]
