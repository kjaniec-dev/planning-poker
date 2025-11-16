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


# Stage 3: Production runner using distroless
FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

# Copy standalone build (includes all necessary dependencies)
COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/public ./public

# Copy Node WebSocket server (for embedded mode)
COPY --from=builder --chown=nonroot:nonroot /app/servers/node/dist ./servers/node/dist
COPY --from=deps --chown=nonroot:nonroot /app/servers/node/node_modules ./servers/node/node_modules
COPY --chown=nonroot:nonroot servers/node/package.json ./servers/node/

# Copy custom server for WebSocket integration
COPY --chown=nonroot:nonroot next-server.js ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run as non-root user (already set in distroless image)
USER nonroot

EXPOSE 3000

# Use node directly (distroless doesn't have npm)
CMD ["next-server.js"]
