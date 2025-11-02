# Planning Poker — Realtime setup

This project supports two Socket.IO modes via Docker profiles:

- Embedded: Socket.IO runs inside the Next.js server (single container)
- External: Socket.IO runs as a separate Node server (two containers)

Redis is optional. If you plan to scale horizontally, provide `REDIS_URL` (e.g., a Redis service) and the Socket.IO Redis adapter will be enabled automatically. If `REDIS_URL` is not set, everything runs in-memory.

## Run with Docker

Prerequisites: Docker Compose v2

### 1) Embedded mode (default, single container)

```bash
# build and run
docker compose --profile embedded up --build
# open the app
open http://localhost:3000
```

Notes:
- The Next app starts Socket.IO internally at `path=/api/socketio`.
- Client connects using same-origin (no URL required).

### 2) External mode (separate realtime server)

```bash
docker compose --profile external up --build
open http://localhost:3000
```

Notes:
- The browser connects to `http://localhost:3001/api/socketio` (wired at build-time via `NEXT_PUBLIC_REALTIME_URL`).
- The Next app does NOT start an embedded Socket.IO server in this mode.

### 3) Optional Redis (only if you scale)

Redis is disabled by default. To enable, run Redis and set `REDIS_URL` for the services that need it.

Examples:

```bash
# start Redis (optional)
docker compose --profile redis up -d redis

# use embedded + redis
env REDIS_URL=redis://localhost:6379 \
  docker compose --profile embedded up --build

# use external + redis
env REDIS_URL=redis://localhost:6379 \
  docker compose --profile external up --build
```

If you run everything on a single Docker network without publishing Redis port, use the service hostname, e.g. `REDIS_URL=redis://redis:6379`.

## Development (without Docker)

- Embedded: `npm run dev` (starts Next with embedded Socket.IO if `REALTIME_MODE=embedded`)
- External: run `npm --prefix servers/node run dev` for the realtime server, and start the Next app with `REALTIME_MODE=external`.

## Configuration

- REALTIME_MODE: `embedded` (default) or `external` (Next only)
- NEXT_PUBLIC_REALTIME_URL: public Socket.IO base URL for the browser
  - Embedded build: empty string (same-origin)
  - External build: `http://localhost:3001`
- REDIS_URL: optional; if present, enables the Socket.IO Redis adapter in embedded and external servers
