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


# Stage 3: Production runner using Docker Hardened Images (DHI)
# DHI images are pre-hardened with security best practices built-in
FROM dhi.io/node:24-alpine3.22

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy package.json for module resolution
COPY --chown=node:node package.json ./

# Set environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=1024"

# DHI images already run as non-root user 'node'
USER node

EXPOSE 3001

# DHI images include dumb-init by default
CMD ["node", "dist/index.js"]
