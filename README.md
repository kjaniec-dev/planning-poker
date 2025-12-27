# Planning Poker

A real-time collaborative estimation tool for agile teams. Built with Next.js 16, React 19, and WebSocket for instant synchronization across all participants.

## Features

- **Real-time voting and estimation** - Instant updates via WebSocket
- **Multiple concurrent sessions** - Support for unlimited planning rooms
- **Flexible deployment** - Embedded or external WebSocket servers
- **Dual server implementations** - Node.js and Go WebSocket servers
- **Horizontal scaling** - Redis pub/sub for multi-instance deployments
- **Dark mode support** - System-aware theme switching
- **Responsive design** - Works on desktop and mobile
- **Comprehensive test coverage** - 38+ tests across frontend and backend

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS v4, shadcn/ui
- **Backend**: WebSocket servers in Node.js (`ws` library) and Go (`gorilla/websocket`)
- **State Management**: Real-time sync via WebSocket, local React state
- **Styling**: Tailwind CSS v4 with Radix UI primitives
- **Testing**: Jest, React Testing Library, mock-socket, Go native testing
- **Tooling**: Biome (linter/formatter), Docker, Kubernetes (Helm)

## Quick Start

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- Docker & Docker Compose v2 (for containerized deployment)
- Go 1.24+ (for Go server development)

### Development

**Option 1: External Mode with Node.js WebSocket Server** (Recommended)
```bash
npm install
npm run dev:external
```
- Next.js runs on http://localhost:3000
- WebSocket server runs on http://localhost:3001
- Hot reload for both services

**Option 2: External Mode with Go WebSocket Server**
```bash
npm install
npm run dev:external:go
```
- Next.js runs on http://localhost:3000
- Go WebSocket server runs on http://localhost:3001
- Best for testing Go implementation

**Option 3: Next.js Only** (no WebSocket server)
```bash
npm install
npm run dev:next
```
- Only runs Next.js on http://localhost:3000
- Requires separate WebSocket server to be running

## Docker Deployment

### Deployment Modes

The project supports three deployment modes via Docker Compose profiles:

#### 1. Embedded Mode

WebSocket server runs inside the Next.js custom server (single container).

```bash
docker compose --profile embedded up --build
open http://localhost:3000
```

**Configuration:**
- Single container on port 3000
- WebSocket endpoint: `ws://localhost:3000/api/ws`
- Simpler architecture, best for small deployments

#### 2. External Mode with Node.js

WebSocket server runs as a separate Node.js service (two containers).

```bash
docker compose --profile external up --build
open http://localhost:3000
```

**Configuration:**
- Next.js on port 3000
- Node.js WebSocket server on port 3001
- WebSocket endpoint: `ws://localhost:3001/api/ws`
- Can scale independently

#### 3. External Mode with Go

WebSocket server runs as a separate Go service (two containers).

```bash
docker compose --profile external-go up --build
open http://localhost:3000
```

**Configuration:**
- Next.js on port 3000
- Go WebSocket server on port 3001
- WebSocket endpoint: `ws://localhost:3001/api/ws`
- Higher performance, lower resource usage

### Scaling with Redis

For horizontal scaling (multiple WebSocket server instances), enable Redis pub/sub:

```bash
# Start Redis
docker compose --profile redis up -d redis

# Use with embedded mode
REDIS_URL=redis://redis:6379 docker compose --profile embedded --profile redis up --build

# Use with external mode (Node)
REDIS_URL=redis://redis:6379 docker compose --profile external --profile redis up --build

# Use with external mode (Go)
REDIS_URL=redis://redis:6379 docker compose --profile external-go --profile redis up --build
```

**What Redis enables:**
- Multiple WebSocket server instances
- Messages broadcast across all instances
- Load balancing support
- High availability

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REALTIME_MODE` | Server mode: `embedded` or `external` | `embedded` |
| `NEXT_PUBLIC_REALTIME_URL` | Public WebSocket URL (build-time) | `""` (same-origin) |
| `REDIS_URL` | Redis connection URL (optional) | - |
| `PORT` | Server port | `3000` (Next.js), `3001` (WebSocket) |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |

### Build-time Configuration

**Embedded Mode:**
```bash
NEXT_PUBLIC_REALTIME_URL="" REALTIME_MODE=embedded npm run build
```

**External Mode:**
```bash
NEXT_PUBLIC_REALTIME_URL="http://localhost:3001" REALTIME_MODE=external npm run build
```

## Testing

### Run All Tests

```bash
# Frontend tests
npm test

# Node.js WebSocket server tests
npm run test -w planning-poker-websocket-server

# Go WebSocket server tests
cd servers/golang && go test -v

# All tests (CI)
npm test && \
  npm run test -w planning-poker-websocket-server && \
  cd servers/golang && go test -v
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

**Test Coverage:**
- Frontend: WebSocket client, realtime hooks
- Node.js server: All message types, broadcasting, Redis integration
- Go server: All message types, concurrency, Redis integration
- **Total: 38+ tests**

See [TESTING.md](./TESTING.md) for detailed test documentation.

## Code Quality

### Linting and Formatting

The project uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format

# Check before commit (lint + build)
npm run check
```

## Building

```bash
# Build all (Next.js + Node WebSocket server)
npm run build

# Build only Node WebSocket server
npm run build:ws

# Build only Go WebSocket server
npm run build:ws:go
```

## Production Deployment

### Start Production Servers

```bash
# Embedded mode (Next.js with integrated WebSocket)
REALTIME_MODE=embedded npm run start

# External mode - Next.js only
REALTIME_MODE=external npm run start

# External mode - Node WebSocket server
npm run start:ws

# External mode - Go WebSocket server
npm run start:ws:go
```

### Kubernetes Deployment

Helm chart is available in the `chart/` directory:

```bash
helm install planning-poker ./chart \
  --set image.tag=latest \
  --set realtime.mode=external \
  --set realtime.language=node
```

See [chart/README.md](./chart/README.md) for Kubernetes deployment details.

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Next.js UI │◄─┤ useRealtime │◄─┤ WebSocket Client     │  │
│  │  (React)   │  │  Hook       │  │  (wsClient.ts)       │  │
│  └────────────┘  └─────────────┘  └──────────────────────┘  │
└───────────────────────────────────────┬─────────────────────┘
                                        │ WebSocket
                    ┌───────────────────┴───────────────────┐
                    │                                       │
        ┌───────────▼──────────┐            ┌──────────────▼─────────┐
        │  Embedded Mode       │     OR     │  External Mode         │
        │  ┌────────────────┐  │            │  ┌──────────────────┐  │
        │  │  Next.js       │  │            │  │  Next.js         │  │
        │  │  + WebSocket   │  │            │  │  (frontend only) │  │
        │  │  (port 3000)   │  │            │  │  (port 3000)     │  │
        │  └────────────────┘  │            │  └──────────────────┘  │
        └──────────────────────┘            │  ┌──────────────────┐  │
                                            │  │  WebSocket       │  │
                                            │  │  Server (3001)   │  │
                                            │  │  (Node.js or Go) │  │
                                            │  └──────────────────┘  │
                                            └────────────────────────┘
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │ (Optional)
                                ┌───────▼────────┐
                                │  Redis Pub/Sub │
                                │  (Scaling)     │
                                └────────────────┘
```

### WebSocket Protocol

**Client → Server Messages:**
- `join-room` - Join a planning room
- `vote` - Submit a vote
- `reveal` - Reveal all votes
- `reestimate` - Start a new round
- `reset` - Reset room state
- `update-story` - Update story title/link
- `update-name` - Update participant name
- `suspend-voting` - Suspend voting
- `resume-voting` - Resume voting

**Server → Client Messages:**
- `room-state` - Full room state
- `participant-voted` - Someone voted
- `revealed` - Votes revealed
- `room-reset` - Room reset
- `story-updated` - Story updated

See [CLAUDE.md](./CLAUDE.md) for detailed protocol documentation.

## Project Structure

```
/
├── src/                              # Next.js application
│   ├── app/                          # App Router (pages, layouts)
│   │   ├── game/[room]/page.tsx     # Game room page
│   │   └── components/              # Feature components
│   ├── components/ui/               # shadcn/ui components
│   └── lib/                         # Utilities
│       └── realtime/                # WebSocket client
├── servers/                          # WebSocket servers
│   ├── node/                        # Node.js implementation
│   │   ├── src/index.ts            # Server logic
│   │   └── src/index.test.ts       # Tests (20 tests)
│   └── golang/                      # Go implementation
│       ├── main.go                  # Server logic
│       └── main_test.go             # Tests (18 tests)
├── chart/                            # Helm chart for Kubernetes
├── public/                           # Static assets
├── next-server.js                    # Custom Next.js server (embedded)
├── docker-compose.yml                # Multi-profile deployment
├── Dockerfile                        # Multi-stage build
└── biome.json                        # Linter config
```

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Comprehensive development guide for AI assistants
  - Architecture details
  - Code conventions
  - Development workflows
  - Common tasks
  - Security considerations

- **[TESTING.md](./TESTING.md)** - Test suite documentation
  - Test organization
  - Running tests
  - Writing new tests
  - Coverage reports

## Contributing

1. **Code Style**: Run `npm run lint:fix` before committing
2. **Tests**: Add tests for new features
3. **Commits**: Use conventional commits format
   - `feat:` for new features
   - `fix:` for bug fixes
   - `test:` for test changes
   - `docs:` for documentation
4. **Documentation**: Update CLAUDE.md for significant changes

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

For issues and questions, please open an issue on GitHub.
