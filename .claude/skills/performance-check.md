# Performance Check Skill

## Purpose
Analyze and optimize performance across WebSocket servers, React frontend, and deployment infrastructure. Identify bottlenecks and provide actionable optimization recommendations.

## Context
Real-time Planning Poker application with:
- WebSocket connections with 30-second heartbeat
- Next.js SSR and React 19 with concurrent features
- Two server implementations: Node.js and Golang
- Optional Redis for horizontal scaling
- Large components (results.tsx = 7000+ LOC)

## Tasks to Perform

### 1. WebSocket Performance Analysis

**Connection Performance:**
- Measure connection establishment time
- Analyze heartbeat overhead (30s ping/pong)
- Check reconnection performance (exponential backoff)
- Verify connection pooling efficiency

**Message Throughput:**
- Measure message latency (client → server → broadcast)
- Test with 10, 50, 100, 500 concurrent connections
- Identify message queuing bottlenecks
- Check broadcast performance to large rooms

**Commands:**
```bash
# WebSocket load testing with Artillery
npm install -g artillery
cat > websocket-load-test.yml <<EOF
config:
  target: "ws://localhost:3001"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
  engines:
    ws: {}
scenarios:
  - engine: ws
    flow:
      - send:
          payload: '{"type":"join-room","roomId":"test-room","name":"User{{ \$randomNumber() }}"}'
      - think: 5
      - send:
          payload: '{"type":"vote","value":"5"}'
      - think: 10
EOF
artillery run websocket-load-test.yml
```

### 2. React Performance Profiling

**Component Rendering:**
- Profile large components (results.tsx - 7000 LOC)
- Identify unnecessary re-renders
- Check React DevTools Profiler for bottlenecks
- Measure Time to Interactive (TTI)

**Optimization Opportunities:**
- Missing `React.memo()` for pure components
- Missing `useMemo()`/`useCallback()` for expensive calculations
- Inefficient list rendering (check for proper `key` props)
- Bundle size analysis

**Commands:**
```bash
# Build and analyze bundle
npm run build
npx @next/bundle-analyzer

# Check bundle size
ls -lh .next/static/chunks/

# Lighthouse performance audit
npx lighthouse http://localhost:3000 --view
```

**Files to profile:**
- `/src/app/components/results.tsx` (7000+ LOC - likely needs optimization)
- `/src/app/components/voting-cards.tsx`
- `/src/lib/realtime/useRealtime.ts` (state management hook)

### 3. Server Performance Comparison

Compare Node.js vs Golang implementations:

**Metrics to compare:**
- CPU usage under load
- Memory consumption
- Connection handling capacity
- Message processing latency
- Startup time

**Benchmark commands:**
```bash
# Golang benchmarks
cd servers/golang
go test -bench=. -benchmem -cpuprofile=cpu.prof
go tool pprof cpu.prof

# Node.js profiling
cd ../node
node --prof src/index.js
node --prof-process isolate-*.log > processed.txt
```

### 4. Database/Redis Performance

**If Redis is enabled:**
- Measure Redis pub/sub latency
- Check connection pool efficiency
- Monitor memory usage with many rooms
- Test failover scenarios

**Commands:**
```bash
# Redis performance metrics
redis-cli --latency
redis-cli --latency-history
redis-cli INFO stats
redis-cli SLOWLOG GET 10
```

### 5. Network Performance

**Optimization checks:**
- Verify HTTP/2 is enabled
- Check compression (gzip/brotli)
- Review static asset caching
- Measure CDN effectiveness (if used)

**Next.js optimizations:**
- Image optimization (next/image)
- Font optimization (next/font)
- Code splitting effectiveness
- Prefetching strategy

### 6. Container & Kubernetes Performance

**Container metrics:**
- Startup time (cold start)
- Memory footprint
- CPU throttling
- Resource limits appropriateness

**Kubernetes checks:**
- HPA (Horizontal Pod Autoscaler) configuration
- Resource requests vs limits
- Readiness/liveness probe overhead
- Service mesh latency (if used)

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| WebSocket connection time | <200ms | <500ms |
| Message round-trip latency | <50ms | <100ms |
| Time to Interactive (TTI) | <3s | <5s |
| Bundle size | <200KB gzipped | <400KB |
| Server memory per connection | <1MB | <5MB |
| Support concurrent users | 1000+ | 500+ |

## Output Format

Provide a performance report with:

1. **Performance Metrics**
   - Current measurements vs targets
   - Pass/fail for each metric
   - Trend analysis (if historical data available)

2. **Bottleneck Analysis**
   - Identified performance bottlenecks
   - Root cause analysis
   - Impact assessment (high/medium/low)

3. **Optimization Recommendations**
   - Quick wins (low effort, high impact)
   - Medium-term improvements
   - Long-term architectural changes
   - Code examples for optimizations

4. **Benchmark Comparison**
   - Node.js vs Golang performance
   - Embedded vs External mode
   - With/without Redis

## Tools & Libraries

Suggested performance tools:
- **Load Testing**: Artillery, k6, autocannon
- **Profiling**: Chrome DevTools, React DevTools Profiler
- **Monitoring**: Prometheus, Grafana, New Relic
- **Bundle Analysis**: @next/bundle-analyzer, webpack-bundle-analyzer
- **Lighthouse**: For overall web performance metrics

## Success Criteria
- All critical performance targets met
- Bottlenecks identified with root causes
- Optimization recommendations prioritized by impact
- Before/after metrics for suggested optimizations
- Actionable code examples provided
