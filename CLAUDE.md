# CLAUDE.md - AI Assistant Guide

This document provides comprehensive guidance for AI assistants working with the Planning Poker codebase. It covers architecture, conventions, workflows, and best practices to ensure effective and consistent code contributions.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Codebase Structure](#codebase-structure)
4. [Technology Stack](#technology-stack)
5. [Development Workflows](#development-workflows)
6. [Code Conventions](#code-conventions)
7. [Testing Guidelines](#testing-guidelines)
8. [Common Tasks](#common-tasks)
9. [Deployment Modes](#deployment-modes)
10. [Security Considerations](#security-considerations)
11. [Important Files Reference](#important-files-reference)

---

## Project Overview

**Planning Poker** is a real-time collaborative estimation tool for agile teams. It supports multiple concurrent planning sessions with WebSocket-based synchronization.

### Key Features
- Real-time voting and estimation
- Multiple deployment modes (embedded/external WebSocket servers)
- Horizontal scaling with Redis pub/sub
- Dual WebSocket server implementations (Node.js and Go)
- Dark mode support
- Responsive design
- Comprehensive test coverage (38+ tests)

### Tech Stack at a Glance
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind v4, shadcn/ui
- **Backend**: WebSocket servers in Node.js (`ws` library) and Go (`gorilla/websocket`)
- **State**: Real-time sync via WebSocket, local React state for UI
- **Styling**: Tailwind CSS v4, CSS variables for theming, Radix UI primitives
- **Testing**: Jest, React Testing Library, mock-socket, Go native testing
- **Tooling**: Biome (linter/formatter), Docker, Kubernetes (Helm)

---

## Architecture

### High-Level Architecture

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
```typescript
type ClientMessage =
  | { type: 'join-room', roomId: string, name: string }
  | { type: 'vote', roomId: string, vote: string }
  | { type: 'reveal', roomId: string }
  | { type: 'reestimate', roomId: string }
  | { type: 'reset', roomId: string }
  | { type: 'update-story', roomId: string, story: { title: string, link?: string } }
  | { type: 'update-name', roomId: string, name: string }
  | { type: 'suspend-voting', roomId: string }
  | { type: 'resume-voting', roomId: string }
```

**Server → Client Messages:**
```typescript
type ServerMessage =
  | { type: 'room-state', participants: Participant[], revealed: boolean, story?: Story, lastRound?: LastRound }
  | { type: 'participant-voted', id: string, hasVote: boolean }
  | { type: 'revealed', participants: Participant[], lastRound?: LastRound }
  | { type: 'room-reset', participants: Participant[], story?: Story }
  | { type: 'story-updated', story: Story }
```

---

## Codebase Structure

```
/home/user/planning-poker/
├── src/                              # Next.js application
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx               # Root layout (theme, fonts, metadata)
│   │   ├── page.tsx                 # Landing page (create/join room)
│   │   ├── globals.css              # Tailwind + theme variables
│   │   ├── game/[room]/page.tsx     # Game room (dynamic route)
│   │   └── components/              # Feature components
│   │       ├── voting-cards.tsx     # Card selection UI
│   │       ├── results.tsx          # Vote results display
│   │       ├── participants.tsx     # Participant list
│   │       ├── story-info.tsx       # Story title/link input
│   │       ├── theme-provider.tsx   # Dark mode wrapper
│   │       ├── theme-toggle.tsx     # Mode switcher
│   │       └── confirm-dialog.tsx   # Confirmation dialogs
│   ├── components/ui/               # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── lib/                         # Utilities and libraries
│       ├── utils.ts                 # cn(), calculateAverage, calculateMedian
│       └── realtime/                # WebSocket client
│           ├── wsClient.ts          # Connection management
│           ├── useRealtime.ts       # React hook
│           └── __tests__/           # Client tests
├── servers/                          # WebSocket servers
│   ├── node/                        # Node.js implementation
│   │   ├── src/index.ts            # Server logic
│   │   ├── src/index.test.ts       # Server tests (20 tests)
│   │   ├── package.json            # Workspace package
│   │   └── Dockerfile
│   └── golang/                      # Go implementation
│       ├── main.go                  # Server logic
│       ├── main_test.go             # Server tests (18 tests)
│       ├── go.mod
│       └── Dockerfile
├── chart/                            # Helm chart for Kubernetes
│   ├── templates/                   # K8s manifests
│   └── values.yaml
├── public/                           # Static assets
├── next-server.js                    # Custom Next.js server (embedded mode)
├── docker-compose.yml                # Multi-profile deployment
├── Dockerfile                        # Multi-stage build
├── package.json                      # Root package with workspaces
├── tsconfig.json                     # TypeScript config
├── biome.json                        # Linter/formatter config
├── components.json                   # shadcn/ui config
├── README.md                         # Architecture docs
├── TESTING.md                        # Test documentation
└── CLAUDE.md                         # This file
```

### Key Directories

- **`src/app/`**: Next.js App Router pages and layouts (React Server Components)
- **`src/app/components/`**: Feature components specific to pages (colocated)
- **`src/components/ui/`**: Reusable UI primitives from shadcn/ui
- **`src/lib/`**: Shared utilities and business logic
- **`src/lib/realtime/`**: WebSocket client implementation and React hooks
- **`servers/node/`**: Node.js WebSocket server (npm workspace)
- **`servers/golang/`**: Go WebSocket server (parallel implementation)
- **`chart/`**: Kubernetes deployment manifests (Helm)

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.0 | React framework with App Router |
| React | 19.2.3 | UI library |
| TypeScript | 5.9.3 | Type safety |
| Tailwind CSS | 4.1.18 | Utility-first styling |
| shadcn/ui | Latest | Component library (New York style) |
| Radix UI | Various | Headless UI primitives |
| next-themes | 0.4.6 | Dark mode support |
| lucide-react | 0.562.0 | Icon library |

### Backend (Node.js)

| Technology | Version | Purpose |
|------------|---------|---------|
| ws | 8.18.3 | WebSocket library |
| ioredis | 5.8.2 | Redis client (optional scaling) |
| TypeScript | 5.9.3 | Type safety |

### Backend (Go)

| Technology | Version | Purpose |
|------------|---------|---------|
| Go | 1.24 | Language runtime |
| gorilla/websocket | 1.5.3 | WebSocket library |
| go-redis | 9.17.2 | Redis client (optional scaling) |

### Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| Jest | 30.2.0 | Test runner |
| @testing-library/react | 16.3.1 | React testing utilities |
| mock-socket | 9.3.1 | WebSocket mocking |
| Go testing | Native | Go test framework |

### Tooling

| Technology | Version | Purpose |
|------------|---------|---------|
| Biome | 2.3.10 | Linter + formatter (replaces ESLint/Prettier) |
| Concurrently | 9.2.1 | Run multiple dev servers |
| Nodemon | 3.1.11 | Auto-restart Node server |
| Docker | - | Containerization |
| Helm | - | Kubernetes deployment |

---

## Development Workflows

### Local Development

**Embedded Mode** (WebSocket inside Next.js):
```bash
npm run dev:embedded
# or just
npm run dev
```
- Single process on port 3000
- WebSocket at `/api/ws`
- Best for simple development

**External Mode with Node.js WebSocket Server**:
```bash
npm run dev:external
```
- Next.js on port 3000
- WebSocket server on port 3001
- Requires `NEXT_PUBLIC_REALTIME_URL=http://localhost:3001`

**External Mode with Go WebSocket Server**:
```bash
npm run dev:external:go
```
- Next.js on port 3000
- Go WebSocket server on port 3001
- Best for testing Go implementation

### Docker Development

**Embedded Mode**:
```bash
docker compose --profile embedded up --build
```

**External Mode (Node)**:
```bash
docker compose --profile external up --build
```

**External Mode (Go)**:
```bash
docker compose --profile external-go up --build
```

**With Redis** (for scaling):
```bash
REDIS_URL=redis://redis:6379 docker compose --profile embedded --profile redis up --build
```

### Running Tests

**All Frontend Tests**:
```bash
npm test
```

**Frontend Tests (Watch Mode)**:
```bash
npm run test:watch
```

**Node.js Server Tests**:
```bash
cd servers/node && npm test
```

**Go Server Tests**:
```bash
cd servers/golang && go test -v
```

**All Tests** (CI):
```bash
cd servers/golang && go test -v && \
cd ../node && npm test && \
cd ../.. && npm test
```

### Linting and Formatting

**Check Issues**:
```bash
npm run lint
```

**Auto-fix**:
```bash
npm run lint:fix
```

**Format Code**:
```bash
npm run format
```

**Pre-commit Check**:
```bash
npm run check  # lint + build
```

---

## Code Conventions

### File Naming

- **Pages**: `page.tsx` (Next.js convention)
- **Layouts**: `layout.tsx` (Next.js convention)
- **Components**: `kebab-case.tsx` (e.g., `voting-cards.tsx`)
- **Tests**: `*.test.ts` or `*.test.tsx` in `__tests__/` folders
- **Config files**: As per tool conventions

### Component Patterns

**Use Client Directive**:
```typescript
"use client"  // For interactive components

import { useState } from "react"
// ...
```

**Props Type Definition**:
```typescript
type VotingCardsProps = {
  onVote: (vote: string) => void
  disabled?: boolean
  currentVote?: string | null
}

export function VotingCards({ onVote, disabled, currentVote }: VotingCardsProps) {
  // ...
}
```

**Class Name Merging**:
```typescript
import { cn } from "@/lib/utils"

<Button className={cn("default-classes", conditionalClass && "extra-class")} />
```

**Component Composition** (shadcn pattern):
```typescript
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
</Card>
```

### TypeScript Conventions

- **Strict mode enabled**: All type errors must be resolved
- **Path aliases**: Use `@/*` for `src/*` imports
- **Explicit types**: Prefer explicit types over inference for function parameters and return values
- **Type imports**: Use `type` keyword when importing only types

```typescript
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
```

### Styling Conventions

**Tailwind Utility-First**:
```typescript
// Good
<div className="flex items-center gap-4 p-6 rounded-lg bg-card">

// Avoid custom classes unless absolutely necessary
```

**Dark Mode**:
```typescript
// Use semantic color tokens
<div className="bg-background text-foreground">
<div className="bg-card text-card-foreground">
<div className="border-border">

// These automatically adapt to dark mode via CSS variables
```

**Responsive Design**:
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

### State Management

**Local UI State**:
```typescript
const [isOpen, setIsOpen] = useState(false)
```

**Real-time State** (from WebSocket):
```typescript
const { participants, revealed, vote, reveal } = useRealtime(roomId, userName)
```

**URL State**:
```typescript
// Room code in path params
const params = useParams<{ room: string }>()

// User name in query params
const searchParams = useSearchParams()
const userName = searchParams.get("name")
```

### Error Handling

**WebSocket Errors**:
```typescript
// wsClient handles reconnection automatically
// Log errors but don't crash
wsClient.subscribe((msg) => {
  try {
    handleMessage(msg)
  } catch (error) {
    console.error("Message handling error:", error)
  }
})
```

**UI Error States**:
```typescript
{!isConnected && (
  <div className="text-destructive">
    Connection lost. Reconnecting...
  </div>
)}
```

---

## Testing Guidelines

### Testing Philosophy

- **Unit tests**: For utilities and pure functions
- **Integration tests**: For WebSocket message flows
- **Component tests**: For React components with user interactions
- **Coverage focus**: Critical paths (realtime sync, state management)

### Frontend Testing Patterns

**Testing React Hooks**:
```typescript
import { renderHook, waitFor } from "@testing-library/react"
import { useRealtime } from "../useRealtime"

test("updates participants on room-state message", async () => {
  const { result } = renderHook(() => useRealtime("room1", "Alice"))

  // Send mock WebSocket message
  mockServer.send({ type: "room-state", participants: [...] })

  await waitFor(() => {
    expect(result.current.participants).toHaveLength(2)
  })
})
```

**Testing Components**:
```typescript
import { render, screen, fireEvent } from "@testing-library/react"
import { VotingCards } from "../voting-cards"

test("calls onVote when card is clicked", () => {
  const onVote = jest.fn()
  render(<VotingCards onVote={onVote} />)

  fireEvent.click(screen.getByText("5"))
  expect(onVote).toHaveBeenCalledWith("5")
})
```

### Backend Testing Patterns

**Node.js WebSocket Tests**:
```typescript
import WebSocket from "ws"

test("broadcasts vote to other participants", async () => {
  const ws1 = new WebSocket("ws://localhost:3001/api/ws")
  const ws2 = new WebSocket("ws://localhost:3001/api/ws")

  // Setup message listeners
  const messages: any[] = []
  ws2.on("message", (data) => {
    messages.push(JSON.parse(data.toString()))
  })

  // Send vote from ws1
  ws1.send(JSON.stringify({ type: "vote", roomId: "room1", vote: "5" }))

  // Verify ws2 receives participant-voted
  await waitForMessage(messages, (msg) => msg.type === "participant-voted")
})
```

**Go WebSocket Tests**:
```go
func TestVoteBroadcast(t *testing.T) {
    // Create test server
    server := httptest.NewServer(http.HandlerFunc(handleWebSocket))
    defer server.Close()

    // Connect clients
    ws1, _, _ := websocket.DefaultDialer.Dial(wsURL(server), nil)
    ws2, _, _ := websocket.DefaultDialer.Dial(wsURL(server), nil)

    // Send vote from ws1
    ws1.WriteJSON(Message{Type: "vote", RoomID: "room1", Vote: "5"})

    // Verify ws2 receives broadcast
    var msg Message
    ws2.ReadJSON(&msg)
    assert.Equal(t, "participant-voted", msg.Type)
}
```

### Test Files Location

- **Frontend**: `src/lib/realtime/__tests__/`
- **Node.js Server**: `servers/node/src/index.test.ts`
- **Go Server**: `servers/golang/main_test.go`

### Running Specific Tests

```bash
# Frontend tests matching pattern
npm test -- --testPathPattern="realtime"

# Single test file
npm test -- wsClient.test.ts

# Node server tests
cd servers/node && npm test

# Go server tests
cd servers/golang && go test -v -run TestVoteBroadcast
```

---

## Common Tasks

### Adding a New WebSocket Message Type

**1. Update Protocol** (both servers):

Node.js (`servers/node/src/index.ts`):
```typescript
// Add message type
type NewMessageType = {
  type: "new-action"
  roomId: string
  data: any
}

// Add handler
if (message.type === "new-action") {
  const room = getOrCreateRoom(message.roomId)
  // Handle action
  broadcastToRoom(message.roomId, {
    type: "new-action-result",
    data: result
  })
}
```

Go (`servers/golang/main.go`):
```go
// Add case in handleMessage
case "new-action":
    room := getOrCreateRoom(msg.RoomID)
    // Handle action
    broadcastToRoom(msg.RoomID, Message{
        Type: "new-action-result",
        Data: result,
    }, client.id)
```

**2. Update Client** (`src/lib/realtime/useRealtime.ts`):
```typescript
// Add action
const newAction = useCallback((data: any) => {
  wsClient.send({
    type: "new-action",
    roomId,
    data
  })
}, [roomId])

// Add message handler
if (msg.type === "new-action-result") {
  // Update local state
}

// Export action
return { ..., newAction }
```

**3. Add Tests**:
- Add server tests in `servers/node/src/index.test.ts` and `servers/golang/main_test.go`
- Add client tests in `src/lib/realtime/__tests__/useRealtime.test.tsx`

### Adding a New UI Component

**1. Create Component** (`src/app/components/new-feature.tsx`):
```typescript
"use client"

type NewFeatureProps = {
  data: string
}

export function NewFeature({ data }: NewFeatureProps) {
  return (
    <Card>
      <CardContent>
        <p>{data}</p>
      </CardContent>
    </Card>
  )
}
```

**2. Use in Page** (`src/app/game/[room]/page.tsx`):
```typescript
import { NewFeature } from "@/app/components/new-feature"

export default function GamePage() {
  return (
    <div>
      <NewFeature data="test" />
    </div>
  )
}
```

**3. Add Tests** (optional for simple components):
```typescript
// src/app/components/__tests__/new-feature.test.tsx
import { render, screen } from "@testing-library/react"
import { NewFeature } from "../new-feature"

test("renders data", () => {
  render(<NewFeature data="test" />)
  expect(screen.getByText("test")).toBeInTheDocument()
})
```

### Adding a shadcn/ui Component

```bash
npx shadcn@latest add [component-name]
# Example:
npx shadcn@latest add dialog
```

This will:
- Add component to `src/components/ui/`
- Install any required dependencies
- Use the New York style (configured in `components.json`)

### Modifying Theme Colors

Edit `src/app/globals.css`:
```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    /* ... */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... */
  }
}
```

Colors use HSL format: `hue saturation% lightness%`

### Adding Environment Variables

**1. Add to Docker Compose** (`docker-compose.yml`):
```yaml
environment:
  - NEW_VAR=${NEW_VAR}
```

**2. Add to Helm Chart** (`chart/values.yaml` and `chart/templates/deployment.yaml`):
```yaml
# values.yaml
env:
  newVar: "value"

# deployment.yaml
env:
  - name: NEW_VAR
    value: {{ .Values.env.newVar | quote }}
```

**3. Use in Code**:
```typescript
// Server-side (Next.js)
const value = process.env.NEW_VAR

// Client-side (must start with NEXT_PUBLIC_)
const publicValue = process.env.NEXT_PUBLIC_NEW_VAR
```

---

## Deployment Modes

### Embedded Mode (Default)

**Characteristics**:
- WebSocket server runs inside Next.js custom server
- Single container deployment
- Simpler architecture
- Port 3000 serves both HTTP and WebSocket

**Configuration**:
```bash
REALTIME_MODE=embedded
NEXT_PUBLIC_REALTIME_URL=  # Empty for same-origin
```

**Use Cases**:
- Small deployments
- Single-instance applications
- Development environments

### External Mode

**Characteristics**:
- WebSocket server as separate service
- Two-container deployment
- Can scale independently
- WebSocket on port 3001, Next.js on port 3000

**Configuration**:
```bash
REALTIME_MODE=external
NEXT_PUBLIC_REALTIME_URL=http://localhost:3001  # Build-time variable
```

**Use Cases**:
- Production deployments
- Multi-instance scaling
- Language-specific optimizations (Go for performance)

### Scaling with Redis

**Configuration**:
```bash
REDIS_URL=redis://redis:6379
```

**Behavior**:
- Enables Redis pub/sub adapter
- Allows multiple WebSocket server instances
- Messages broadcast across all instances
- Shared state across servers

**Use Cases**:
- Horizontal scaling
- High availability
- Load-balanced deployments

---

## Security Considerations

### Content Security Policy

Next.js config includes strict CSP headers (`next.config.ts`):
- `default-src 'self'`
- `script-src` allows Next.js chunks
- `connect-src` allows WebSocket connections
- `img-src` allows external images

**Modifying CSP**:
Edit `next.config.ts` → `headers()` → `Content-Security-Policy`

### WebSocket Origin Validation

Both servers validate WebSocket origins:

**Node.js** (`servers/node/src/index.ts`):
```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"]
```

**Go** (`servers/golang/main.go`):
```go
CheckOrigin: func(r *http.Request) bool {
  origin := r.Header.Get("Origin")
  return isAllowedOrigin(origin)
}
```

### Docker Security

**Security features** (see `Dockerfile`):
- Distroless base image (minimal attack surface)
- Non-root user (`nextjs` user)
- Read-only filesystem (where possible)
- Dropped capabilities
- Security scanning in CI

### Input Validation

**WebSocket messages**:
- Type validation on all incoming messages
- Room ID validation (alphanumeric)
- Name sanitization
- Vote value validation

**Add validation for new message types**:
```typescript
if (!message.roomId || typeof message.roomId !== "string") {
  console.error("Invalid roomId")
  return
}
```

---

## Important Files Reference

### Configuration Files

| File | Purpose | When to Modify |
|------|---------|---------------|
| `package.json` | Root dependencies, scripts, workspaces | Adding npm scripts or dependencies |
| `tsconfig.json` | TypeScript compiler options, path aliases | Changing module resolution or compiler flags |
| `biome.json` | Linter and formatter rules | Adjusting code style rules |
| `next.config.ts` | Next.js configuration, security headers | Adding headers, redirects, or build config |
| `components.json` | shadcn/ui configuration | Changing component style or path |
| `docker-compose.yml` | Multi-service Docker setup | Adding services or changing deployment mode |
| `Dockerfile` | Container build instructions | Changing build process or base image |
| `.nvmrc` | Node.js version specification | Upgrading Node version |

### Key Source Files

| File | Purpose | Modify For |
|------|---------|-----------|
| `src/app/layout.tsx` | Root layout, theme provider, fonts | Global layout changes, metadata |
| `src/app/page.tsx` | Landing page (create/join room) | Landing page UI |
| `src/app/game/[room]/page.tsx` | Main game room page | Game UI and logic |
| `src/lib/realtime/wsClient.ts` | WebSocket connection management | Connection logic, reconnection |
| `src/lib/realtime/useRealtime.ts` | React hook for realtime state | State management, actions |
| `src/lib/utils.ts` | Utility functions | Adding shared utilities |
| `servers/node/src/index.ts` | Node.js WebSocket server | Server-side message handling (Node) |
| `servers/golang/main.go` | Go WebSocket server | Server-side message handling (Go) |
| `next-server.js` | Custom Next.js server (embedded) | Embedded mode WebSocket setup |

### Test Files

| File | Purpose | Coverage |
|------|---------|----------|
| `src/lib/realtime/__tests__/wsClient.test.ts` | WebSocket client tests | Connection, reconnection, messages |
| `src/lib/realtime/__tests__/useRealtime.test.tsx` | React hook tests | State management, actions |
| `servers/node/src/index.test.ts` | Node.js server tests | All message types, broadcasting |
| `servers/golang/main_test.go` | Go server tests | All message types, concurrency |

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Architecture overview, Docker setup |
| `TESTING.md` | Test suite documentation, coverage |
| `CLAUDE.md` | AI assistant guide (this file) |

---

## Best Practices for AI Assistants

### Before Making Changes

1. **Read relevant files first** - Use Read tool to understand existing code
2. **Check tests** - Review test files to understand expected behavior
3. **Follow existing patterns** - Match the style and structure of similar code
4. **Verify TypeScript** - Ensure all types are correct and strict mode passes

### When Adding Features

1. **Start with tests** - Write tests first or alongside implementation
2. **Update both servers** - If changing WebSocket protocol, update both Node.js and Go
3. **Update client** - Keep `wsClient.ts` and `useRealtime.ts` in sync
4. **Document behavior** - Add comments for complex logic
5. **Run tests** - Verify all tests pass before committing

### When Fixing Bugs

1. **Reproduce first** - Understand the bug and how to test it
2. **Add regression test** - Ensure the bug doesn't come back
3. **Check both servers** - Bug might exist in both implementations
4. **Test thoroughly** - Run all affected tests

### Code Quality

1. **Use Biome** - Run `npm run lint:fix` before committing
2. **Type safety** - No `any` types without justification
3. **Error handling** - Handle errors gracefully, log appropriately
4. **Security** - Validate all inputs, especially from WebSocket messages
5. **Performance** - Avoid unnecessary re-renders, optimize WebSocket messages

### Git Workflow

1. **Commit messages** - Use conventional commits format:
   - `feat: add suspend/resume voting`
   - `fix: reconnection not preserving room state`
   - `test: add coverage for vote broadcasting`
   - `docs: update CLAUDE.md with new patterns`

2. **Commit scope** - Keep commits focused on single changes

3. **Branch naming** - Use descriptive names:
   - `feature/add-timer`
   - `fix/websocket-reconnect`
   - `refactor/simplify-state`

### Common Pitfalls to Avoid

1. **Don't modify `src/components/ui/`** - These are shadcn components, regenerate instead
2. **Don't add CSS classes** - Use Tailwind utilities exclusively
3. **Don't skip tests** - Maintain high test coverage
4. **Don't break WebSocket protocol** - Both servers must stay in sync
5. **Don't expose secrets** - Never commit API keys or credentials
6. **Don't ignore TypeScript errors** - Fix all type issues
7. **Don't forget client-side env vars** - Must start with `NEXT_PUBLIC_`

---

## Helpful Commands Reference

### Development
```bash
npm run dev                    # Embedded mode
npm run dev:external           # External mode (Node)
npm run dev:external:go        # External mode (Go)
```

### Testing
```bash
npm test                       # All frontend tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage
cd servers/node && npm test    # Node server tests
cd servers/golang && go test -v # Go server tests
```

### Linting/Formatting
```bash
npm run lint                   # Check issues
npm run lint:fix               # Auto-fix
npm run format                 # Format code
npm run check                  # Lint + build
```

### Building
```bash
npm run build                  # Build all
npm run build:ws               # Build Node WebSocket server
npm run build:ws:go            # Build Go WebSocket server
```

### Running Production
```bash
npm run start                  # Start Next.js (embedded mode)
npm run start:ws               # Start Node WebSocket server
npm run start:ws:go            # Start Go WebSocket server
```

### Docker
```bash
docker compose --profile embedded up --build
docker compose --profile external up --build
docker compose --profile external-go up --build
```

---

## Questions or Issues?

If you encounter unclear conventions or need clarification:

1. **Check test files** - They often demonstrate correct usage
2. **Look for similar code** - Find examples in the codebase
3. **Read documentation** - README.md, TESTING.md provide context
4. **Examine types** - TypeScript types document expected shapes

This document is maintained to stay current with the codebase. When making significant changes, update this guide accordingly.
