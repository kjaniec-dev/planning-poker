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

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy package.json for module resolution
COPY --chown=nodejs:nodejs package.json ./

# Set environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=1024"

# Run as non-root user
USER nodejs

EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
