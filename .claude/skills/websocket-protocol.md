# WebSocket Protocol Skill

## Purpose
Review, validate, and optimize the WebSocket protocol implementation across Node.js server, Golang server, and React client. Ensure protocol consistency, type safety, and proper error handling.

## Context
Planning Poker uses a custom WebSocket protocol with:
- **Client implementations**: React hook (`useRealtime.ts`) + WebSocket client (`wsClient.ts`)
- **Server implementations**: Node.js (`servers/node/src/index.ts`) + Golang (`servers/golang/main.go`)
- **Connection management**: Heartbeat (30s), automatic reconnection, exponential backoff
- **Message types**: 9 client→server, 5 server→client

## Tasks to Perform

### 1. Protocol Definition Review

**Client → Server Messages:**
1. `join-room` - Enter a planning poker room
2. `vote` - Submit an estimation vote
3. `reveal` - Show all votes
4. `reestimate` - Clear votes, start new round
5. `reset` - Full game reset (clear story + votes)
6. `update-story` - Change current story/task
7. `update-name` - Change participant name
8. `suspend-voting` - Pause voting
9. `resume-voting` - Resume voting

**Server → Client Messages:**
1. `room-state` - Complete room synchronization
2. `participant-voted` - Vote submission notification
3. `revealed` - Vote reveal with results
4. `room-reset` - Reset confirmation
5. `story-updated` - Story change broadcast

**Check files:**
- `/src/lib/realtime/wsClient.ts` - Client message sending
- `/src/lib/realtime/useRealtime.ts` - Client message handling
- `/servers/node/src/index.ts` - Node.js server
- `/servers/golang/main.go` - Golang server

### 2. Type Safety Validation

**TypeScript Type Definitions:**

Ensure message types are properly defined with discriminated unions:

```typescript
// Client → Server
type ClientMessage =
  | { type: 'join-room'; roomId: string; name: string }
  | { type: 'vote'; value: string }
  | { type: 'reveal' }
  | { type: 'reestimate' }
  | { type: 'reset' }
  | { type: 'update-story'; title: string; description?: string }
  | { type: 'update-name'; name: string }
  | { type: 'suspend-voting' }
  | { type: 'resume-voting' };

// Server → Client
type ServerMessage =
  | { type: 'room-state'; participants: Participant[]; /* ... */ }
  | { type: 'participant-voted'; participantId: string }
  | { type: 'revealed'; votes: Record<string, string> }
  | { type: 'room-reset' }
  | { type: 'story-updated'; story: Story };
```

**Golang Type Definitions:**

Ensure Golang structs match TypeScript interfaces:

```go
type Message struct {
    Type string `json:"type"`
    // Fields should match TypeScript
}

// Consider using a map or type switch for message handling
```

**Validation checks:**
- [ ] All message types have proper TypeScript interfaces
- [ ] Golang structs match TypeScript types
- [ ] Required vs optional fields consistent
- [ ] Enum values for vote options defined
- [ ] No `any` types in message definitions

### 3. Protocol Consistency Check

**Cross-implementation validation:**

Verify that all three implementations handle messages identically:
1. React client sends proper message format
2. Node.js server parses and responds correctly
3. Golang server parses and responds identically
4. Both servers broadcast in same format

**Test matrix:**

| Message Type | Client Sends | Node Handles | Go Handles | Response Identical |
|--------------|--------------|--------------|------------|-------------------|
| join-room    | ✓            | ✓            | ✓          | ✓                 |
| vote         | ✓            | ✓            | ✓          | ✓                 |
| reveal       | ✓            | ✓            | ✓          | ✓                 |
| ...          | ...          | ...          | ...        | ...               |

### 4. Error Handling Review

**Client-side error handling:**
- [ ] Connection failures gracefully handled
- [ ] Reconnection with exponential backoff
- [ ] Message send failures logged
- [ ] Invalid server messages don't crash client
- [ ] Timeout handling for long operations

**Server-side error handling:**
- [ ] Invalid JSON handled without crashing
- [ ] Unknown message types logged and ignored
- [ ] Missing required fields validated
- [ ] Room not found errors handled
- [ ] Concurrent access thread-safe

**Check for:**
```typescript
// Good: Error boundaries
try {
  const message = JSON.parse(data);
  handleMessage(message);
} catch (error) {
  console.error('Invalid message:', error);
  // Don't crash, just log
}

// Bad: Unhandled errors
const message = JSON.parse(data); // Can throw
handleMessage(message); // Can throw
```

### 5. Connection Management Review

**Heartbeat/Ping-Pong:**
- [ ] Client sends ping every 30 seconds
- [ ] Server responds with pong
- [ ] Connection considered dead after timeout
- [ ] Automatic reconnection triggered

**Reconnection Strategy:**
- [ ] Exponential backoff implemented (1s, 2s, 4s, 8s, 16s...)
- [ ] Maximum retry attempts defined
- [ ] Connection state properly tracked
- [ ] Last joined room remembered for reconnection

**Graceful Disconnection:**
- [ ] Client cleanup on unmount
- [ ] Server cleanup on connection close
- [ ] Participant removed from room
- [ ] Room deleted if empty
- [ ] No memory leaks

**Check files:**
- `/src/lib/realtime/wsClient.ts:30-70` - Reconnection logic
- `/servers/node/src/index.ts` - Connection cleanup
- `/servers/golang/main.go` - Goroutine cleanup

### 6. Performance Optimization

**Message Optimization:**
- [ ] Messages are minimal size (no unnecessary fields)
- [ ] Binary protocol considered for high-frequency messages
- [ ] Message batching for bulk operations
- [ ] Compression enabled for large payloads

**Broadcasting Optimization:**
- [ ] Broadcast only to room participants (not all connections)
- [ ] Sender excluded from broadcast when appropriate
- [ ] Concurrent broadcasting (Golang goroutines)
- [ ] Message queue to prevent blocking

**Connection Pooling:**
- [ ] Maximum connections per room limited
- [ ] Connection pool sizing appropriate
- [ ] Memory usage per connection optimized

### 7. Security Review

**Input Validation:**
- [ ] Room IDs validated (format, length)
- [ ] Participant names sanitized (XSS prevention)
- [ ] Vote values validated against allowed options
- [ ] Story content sanitized
- [ ] Message size limits enforced

**Authorization:**
- [ ] Participants can only vote in joined rooms
- [ ] Room isolation enforced (can't access other rooms)
- [ ] Rate limiting to prevent flooding
- [ ] Origin validation for WebSocket handshake

**Potential vulnerabilities:**
```typescript
// Bad: No validation
socket.on('message', (data) => {
  const msg = JSON.parse(data);
  broadcastToRoom(msg.roomId, msg); // XSS, injection risks
});

// Good: Validation
socket.on('message', (data) => {
  const msg = validateMessage(JSON.parse(data));
  if (!msg) return;
  const sanitized = sanitizeMessage(msg);
  broadcastToRoom(sanitized.roomId, sanitized);
});
```

### 8. Testing Protocol Implementation

**Test coverage check:**
- [ ] All message types have tests
- [ ] Invalid messages tested
- [ ] Concurrent operations tested
- [ ] Reconnection scenarios tested
- [ ] Large room scenarios tested (100+ participants)

**Test files to review:**
- `/servers/golang/main_test.go` - Golang protocol tests
- `/servers/node/src/index.test.ts` - Node.js protocol tests
- `/src/lib/realtime/__tests__/wsClient.test.ts` - Client tests
- `/src/lib/realtime/__tests__/useRealtime.test.tsx` - Hook tests

**Missing tests:**
- [ ] E2E client→server→broadcast→client flow
- [ ] Protocol compatibility between Node and Golang
- [ ] Network failure scenarios
- [ ] Message ordering guarantees

### 9. Documentation Review

**Protocol Documentation:**
- [ ] All message types documented
- [ ] Example payloads provided
- [ ] State transition diagrams
- [ ] Error codes defined
- [ ] Versioning strategy

**Create protocol specification:**
```markdown
# Planning Poker WebSocket Protocol v1

## Connection
- URL: ws://[host]/api/socketio (embedded) or ws://[host]:3001/api/socketio (external)
- Heartbeat: 30s ping/pong

## Client → Server Messages
### join-room
Payload: { type: 'join-room', roomId: string, name: string }
Response: room-state
...
```

### 10. Upgrade and Versioning Strategy

**Protocol Evolution:**
- [ ] Version negotiation mechanism
- [ ] Backward compatibility plan
- [ ] Migration strategy for breaking changes
- [ ] Feature detection for optional features

**Future enhancements to consider:**
- Binary protocol (MessagePack, Protocol Buffers)
- Message compression
- Partial state updates (delta updates)
- Optimistic UI updates
- Offline support with sync

## Output Format

Provide a protocol analysis report with:

1. **Protocol Consistency Status**
   - ✓ Consistent / ⚠ Inconsistencies found / ✗ Major issues
   - List of inconsistencies between implementations
   - Type safety violations

2. **Security Analysis**
   - Vulnerabilities found (with severity)
   - Input validation gaps
   - Authorization issues
   - Recommended fixes

3. **Performance Assessment**
   - Message size analysis
   - Broadcasting efficiency
   - Connection overhead
   - Optimization opportunities

4. **Test Coverage**
   - Protocol test coverage percentage
   - Missing test scenarios
   - Recommended additional tests

5. **Documentation Status**
   - Protocol documentation completeness
   - Missing documentation
   - Suggested improvements

6. **Recommendations**
   - Critical fixes (security, correctness)
   - Performance optimizations
   - Protocol enhancements
   - Documentation improvements

## Validation Commands

```bash
# Compare message handling
diff -u <(grep -A5 '"join-room"' servers/node/src/index.ts) \
        <(grep -A5 '"join-room"' servers/golang/main.go)

# Type check
npx tsc --noEmit

# Run protocol tests
cd servers/golang && go test -v -run TestProtocol
cd servers/node && npm test -- --testNamePattern="protocol"
npm test -- --testPathPattern="wsClient"
```

## Success Criteria
- Protocol is consistent across all implementations
- All message types are type-safe
- Security vulnerabilities addressed
- Performance is optimized
- Test coverage is comprehensive
- Protocol is well-documented
