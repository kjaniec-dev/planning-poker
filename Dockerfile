FROM node:24-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}

COPY package.json package-lock.json* ./
COPY servers/node/package.json servers/node/package-lock.json* ./servers/node/

RUN npm ci
RUN npm --prefix servers/node ci

COPY . .

RUN npm run build


FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY servers/node/package.json servers/node/package-lock.json* ./servers/node/

RUN npm ci --omit=dev
RUN npm --prefix servers/node ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/servers/node/dist ./servers/node/dist
COPY next-server.js ./next-server.js

EXPOSE 3000

CMD ["npm", "start"]
