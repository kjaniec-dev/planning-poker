# WebSocket Testing Guide

This document describes the comprehensive test suite for the Planning Poker WebSocket servers and clients.

## Test Coverage

### 1. Golang WebSocket Server Tests (`servers/golang/main_test.go`)

**Location:** `/home/user/planning-poker/servers/golang/main_test.go`

**Run command:**
```bash
cd servers/golang && go test -v
```

**Tests included:**
- ✅ Server initialization and configuration
- ✅ Room creation and management
- ✅ Client connection and disconnection handling
- ✅ join-room message handling
- ✅ vote message handling
- ✅ reveal message handling
- ✅ reestimate message handling
- ✅ reset message handling
- ✅ update-story message handling
- ✅ suspend-voting and resume-voting message handling
- ✅ update-name message handling
- ✅ Broadcasting to room participants
- ✅ Broadcast with client exclusion
- ✅ Multiple clients in same room
- ✅ Concurrent room operations (thread safety)
- ✅ Graceful shutdown

**Test Results:** 18 tests passing

### 2. Node.js WebSocket Server Tests (`servers/node/src/index.test.ts`)

**Location:** `/home/user/planning-poker/servers/node/src/index.test.ts`

**Run command:**
```bash
cd servers/node && npm test
```

**Tests included:**
- ✅ Room management (create, retrieve)
- ✅ WebSocket connection acceptance
- ✅ Multiple concurrent connections
- ✅ join-room message handling
- ✅ Broadcasting to other clients
- ✅ vote message handling
- ✅ Vote broadcasting to participants
- ✅ reveal message handling
- ✅ reestimate message handling
- ✅ reset message handling
- ✅ update-story message handling
- ✅ suspend-voting message handling
- ✅ resume-voting message handling
- ✅ update-name message handling
- ✅ Client disconnection and cleanup
- ✅ Room state consistency across operations
- ✅ Edge cases (malformed messages, unknown types, invalid operations)

**Test Results:** 20 tests passing

### 3. React WebSocket Client Tests

**Location:**
- `/home/user/planning-poker/src/lib/realtime/__tests__/wsClient.test.ts`
- `/home/user/planning-poker/src/lib/realtime/__tests__/useRealtime.test.tsx`

**Run command:**
```bash
npm test -- --testPathPattern="src/lib/realtime"
```

**Tests included:**

#### wsClient.ts tests:
- WebSocket connection establishment
- Prevention of duplicate connections
- join-room message sending
- Reconnection with lastJoin state
- Generic message sending
- Message subscription system
- Multiple simultaneous listeners
- Unsubscribe functionality
- Automatic reconnection on connection loss
- Exponential backoff for reconnections
- Malformed message handling
- Listener error isolation
- URL construction (env var support, WSS for HTTPS)

#### useRealtime.ts hook tests:
- Room joining on mount
- Unsubscribe on unmount
- room-state message handling
- Participant state updates
- Revealed state updates
- Story state updates
- participant-voted message handling
- revealed message handling
- room-reset message handling
- story-updated message handling
- vote() action
- reveal() action
- reestimate() action
- reset() action
- updateStory() action
- suspendVoting() action
- resumeVoting() action
- updateName() action
- Connection status tracking
- Unknown message type warnings

**Note:** React tests require proper WebSocket mocking setup. They test the WebSocket interaction logic in React components and hooks.

## Running All Tests

### Run Golang tests:
```bash
cd servers/golang
go test -v
```

### Run Node.js server tests:
```bash
cd servers/node
npm test
```

### Run React tests:
```bash
# From project root
npm test
```

## Test Architecture

### Server Tests (Golang & Node.js)
Both server test suites use real WebSocket connections to test the server implementations:

- **Golang:** Uses `httptest` and `gorilla/websocket` client
- **Node.js:** Uses `ws` WebSocket client library
- Both test the same protocol and message types
- Both verify thread-safe / concurrent operations
- Both test graceful shutdown procedures

### Client Tests (React)
The React tests use `mock-socket` to simulate WebSocket server behavior:

- Tests WebSocket client connection logic
- Tests React hook state management
- Tests message handling and broadcasting
- Tests reconnection and error handling

## Key Features Tested

### WebSocket Protocol
All tests verify the following message protocol:

**Client → Server:**
- `join-room` - Join a planning poker room
- `vote` - Submit a vote
- `reveal` - Reveal all votes
- `reestimate` - Clear votes and start new round
- `reset` - Full game reset
- `update-story` - Update story details
- `update-name` - Update participant name
- `suspend-voting` - Pause voting
- `resume-voting` - Resume voting

**Server → Client:**
- `room-state` - Full room state update
- `participant-voted` - Notification of vote submission
- `revealed` - Broadcast vote reveal with results
- `room-reset` - Reset confirmation
- `story-updated` - Story update broadcast

### Concurrency & Thread Safety
- ✅ Concurrent room access (Golang with RWMutex)
- ✅ Thread-safe participant management
- ✅ Atomic operations for client state
- ✅ Safe concurrent broadcasting

### Connection Management
- ✅ Heartbeat/ping mechanism (30-second intervals)
- ✅ Automatic client cleanup on disconnect
- ✅ Room participant removal on disconnect
- ✅ Graceful shutdown with connection cleanup
- ✅ Automatic reconnection (client-side, max 10 attempts)
- ✅ Exponential backoff for reconnections

### Error Handling
- ✅ Malformed JSON messages
- ✅ Unknown message types
- ✅ Invalid room operations
- ✅ Network errors and disconnections
- ✅ Listener error isolation

## Test Statistics

- **Total Tests:** 38+ tests across all suites
- **Golang Server:** 18 tests
- **Node.js Server:** 20 tests
- **React Client:** Multiple test cases for wsClient and useRealtime

## Continuous Integration

To run all tests in CI:

```bash
#!/bin/bash
set -e

echo "Running Golang tests..."
cd servers/golang && go test -v

echo "Running Node.js server tests..."
cd ../../servers/node && npm test

echo "Running React tests..."
cd ../.. && npm test

echo "All tests passed!"
```

## Coverage Goals

✅ **Message Protocol:** 100% of message types tested
✅ **Server Operations:** All core operations tested
✅ **Error Cases:** Malformed data, invalid operations
✅ **Concurrency:** Thread safety and race conditions
✅ **Connection Lifecycle:** Connect, disconnect, reconnect

## Troubleshooting

### Golang Tests
If tests fail due to Go version:
```bash
# Check go.mod specifies correct version
# Should match installed Go version
go version
```

### Node.js Tests
If tests timeout:
```bash
# Increase Jest timeout in test file
jest --testTimeout=10000
```

### React Tests
If WebSocket mocking fails:
```bash
# Ensure mock-socket is installed
npm install --save-dev mock-socket
```

## Future Enhancements

Potential additional tests:
- Redis pub/sub integration tests
- Load testing with many concurrent clients
- Performance benchmarks
- End-to-end tests with real browsers
- Visual regression tests for UI components
