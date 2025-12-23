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


# Stage 3: Production runner using Google Distroless
# Distroless images provide minimal attack surface with no shell or package manager
FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=nonroot:nonroot /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist

# Copy package.json for module resolution
COPY --chown=nonroot:nonroot package.json ./

# Set environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=1024"

# Distroless images run as non-root user by default
USER nonroot

EXPOSE 3001

# No shell available in distroless - direct node execution
CMD ["dist/index.js"]
