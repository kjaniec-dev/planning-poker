# Claude Skills and Commands

This document describes the Claude AI skills and slash commands configured for the Planning Poker project. These tools complement the CLAUDE.md AI assistant guide with specialized analysis frameworks and quick-action commands.

## Overview

The Planning Poker project includes:
- **6 Specialized Skills** - Comprehensive analysis frameworks for security, testing, performance, code review, deployment, and WebSocket protocol
- **8 Slash Commands** - Quick shortcuts for common development tasks

## Directory Structure

```
.claude/
├── skills/              # Specialized analysis and audit skills
│   ├── security-audit.md
│   ├── test-suite.md
│   ├── performance-check.md
│   ├── code-review.md
│   ├── deployment-check.md
│   └── websocket-protocol.md
└── commands/            # Slash commands for common tasks
    ├── test-all.md
    ├── lint-all.md
    ├── build-check.md
    ├── security-scan.md
    ├── dev-setup.md
    ├── architecture-review.md
    ├── performance-test.md
    └── deploy-check.md
```

---

## Skills

Skills are comprehensive analysis frameworks that provide in-depth reviews and audits.

### 🔒 security-audit

**File**: `.claude/skills/security-audit.md`

**Purpose**: Perform comprehensive security audits covering all aspects of application security.

**Coverage Areas**:
- **WebSocket Security**: Origin validation, message validation, rate limiting, authentication
- **Container Security**: Distroless images, capabilities, read-only filesystem, non-root user
- **Dependency Scanning**: `npm audit`, Go dependency vulnerabilities
- **Code Security**: XSS prevention, injection attacks, secrets management, error message leaks
- **HTTPS/WSS**: TLS configuration, certificate validation
- **Session Management**: Participant tracking, room isolation, session fixation

**When to Use**:
- Before production deployment
- After major security-related changes
- Periodic security audits (monthly/quarterly)
- When adding new WebSocket message types
- After dependency updates

**Example Usage**:
```
Use the security-audit skill to review our WebSocket implementation
```

**Output**:
- Executive summary with risk rating
- Detailed findings with severity levels (Critical/High/Medium/Low)
- Proof of concept for vulnerabilities
- Remediation steps
- Compliance checklist
- Prioritized recommendations

---

### 🧪 test-suite

**File**: `.claude/skills/test-suite.md`

**Purpose**: Run comprehensive test suites, analyze coverage, identify gaps, and suggest improvements.

**Coverage Areas**:
- **Test Execution**: All 38+ tests across Golang, Node.js, and React
- **Coverage Analysis**: Line, branch, function coverage with targets (85%+ overall)
- **Gap Identification**: Untested edge cases, concurrency scenarios, UI components
- **Test Quality**: Clarity, isolation, assertions, mocking appropriateness
- **New Tests**: Load testing, stress testing, integration, visual regression, accessibility
- **CI/CD Integration**: Automated execution, coverage reporting, performance benchmarks

**When to Use**:
- Before releases or deployments
- During sprint reviews
- When test coverage drops
- After adding new features
- For test suite optimization

**Example Usage**:
```
Run the test-suite skill and report coverage gaps
```

**Output**:
- Test execution summary (passed/failed/skipped, execution time)
- Coverage report with component breakdown
- List of testing gaps with priority ranking
- Recommendations for new tests and infrastructure improvements

---

### ⚡ performance-check

**File**: `.claude/skills/performance-check.md`

**Purpose**: Analyze and optimize performance across all application layers.

**Coverage Areas**:
- **WebSocket Performance**: Connection time, message throughput, heartbeat overhead, reconnection
- **React Profiling**: Component rendering (especially results.tsx at 7000 LOC), bundle size
- **Server Comparison**: Node.js vs Golang metrics (CPU, memory, latency, capacity)
- **Redis Performance**: Pub/sub latency, connection pooling, memory usage
- **Network**: HTTP/2, compression, caching, CDN effectiveness
- **Container Performance**: Startup time, resource limits, HPA configuration

**Performance Targets**:
| Metric | Target | Critical |
|--------|--------|----------|
| WebSocket connection | <200ms | <500ms |
| Message latency | <50ms | <100ms |
| Time to Interactive | <3s | <5s |
| Bundle size | <200KB | <400KB |
| Memory per connection | <1MB | <5MB |
| Concurrent users | 1000+ | 500+ |

**When to Use**:
- When experiencing performance issues
- Before scaling to more users
- For regular performance optimization
- When comparing Node.js vs Golang
- After major architectural changes

**Example Usage**:
```
Use performance-check to identify bottlenecks in our WebSocket implementation
```

**Output**:
- Performance metrics vs targets (pass/fail)
- Bottleneck analysis with root causes
- Optimization recommendations (quick wins, medium-term, long-term)
- Benchmark comparison (Node vs Go, embedded vs external)

---

### 📐 code-review

**File**: `.claude/skills/code-review.md`

**Purpose**: Comprehensive code review focusing on architecture, design patterns, quality, and maintainability.

**Coverage Areas**:
- **Architecture**: Monorepo structure, separation of concerns, circular dependencies
- **Design Patterns**: React patterns, backend patterns, anti-patterns (God objects)
- **Code Quality**: Linting, TypeScript types, naming, comments, magic numbers
- **TypeScript Best Practices**: Strict mode, type guards, discriminated unions
- **React Best Practices**: Component design, hooks usage, performance optimization
- **Next.js 16**: Server/Client Components, streaming, metadata, optimization
- **Backend**: Error handling, memory leaks, WebSocket cleanup, goroutine management
- **Testing**: Test coverage, quality, isolation, descriptive names
- **Documentation**: README completeness, API docs, inline comments

**Review Checklist**:
- **Critical**: Security vulnerabilities, type safety, memory leaks, race conditions
- **High Priority**: Performance bottlenecks, code duplication, missing error handling
- **Medium**: Large components (>300 LOC), complex functions, inconsistent naming
- **Low**: Better variable names, more comments, refactoring opportunities

**When to Use**:
- For PR reviews
- After major feature additions
- Before architectural changes
- Periodic code quality assessments
- Onboarding new team members

**Example Usage**:
```
Perform code-review on the React components in src/app/components/
```

**Output**:
- Executive summary with code quality rating (1-10)
- Detailed findings by category and severity
- Positive highlights of good practices
- Refactoring suggestions (components to split, code to extract)
- Technical debt assessment with prioritization

---

### 🚀 deployment-check

**File**: `.claude/skills/deployment-check.md`

**Purpose**: Validate deployment configurations for production readiness.

**Coverage Areas**:
- **Docker**: Multi-stage builds, image size, security scanning, layer optimization
- **Docker Compose**: Service dependencies, volumes, networks, profiles, health checks
- **Kubernetes**: Helm charts, manifests, HPA, resource limits, RBAC, security context
- **CI/CD**: Pipeline stages (lint, test, build, scan, deploy), approval gates
- **Production Readiness**: Observability, reliability, scalability, security, performance
- **Configuration Management**: Environment variables, secrets, validation
- **Backup/DR**: Backup procedures, restoration testing, RTO/RPO targets
- **Monitoring**: Metrics collection, alerting rules, dashboards

**Production Readiness Checklist**:
- Observability: Logging, metrics, tracing, alerting
- Reliability: Health checks, graceful shutdown, circuit breakers, timeouts
- Scalability: Stateless design, load balancing, auto-scaling
- Security: TLS, secrets management, network policies, scanning
- Performance: CDN, caching, compression, resource limits

**When to Use**:
- Before production deployment
- When updating infrastructure
- For deployment audits
- After Kubernetes configuration changes
- Before scaling initiatives

**Example Usage**:
```
Run deployment-check to validate Kubernetes setup
```

**Output**:
- Deployment configuration scores (Docker, Kubernetes, CI/CD)
- Critical issues blocking production
- Configuration improvements and optimizations
- Production readiness checklist with status
- Deployment recommendations (immediate, short-term, long-term)

---

### 🔌 websocket-protocol

**File**: `.claude/skills/websocket-protocol.md`

**Purpose**: Review, validate, and optimize WebSocket protocol implementation.

**Coverage Areas**:
- **Protocol Definition**: 9 client→server messages, 5 server→client messages
- **Type Safety**: TypeScript discriminated unions, Golang struct matching
- **Consistency**: Cross-implementation validation (React, Node.js, Golang)
- **Error Handling**: Connection failures, invalid messages, timeout handling
- **Connection Management**: Heartbeat (30s), reconnection, graceful disconnection
- **Performance**: Message size, broadcasting efficiency, connection pooling
- **Security**: Input validation, authorization, rate limiting, origin validation
- **Testing**: Protocol test coverage, missing scenarios, E2E flows
- **Documentation**: Protocol specification, state diagrams, versioning

**Protocol Messages**:

**Client → Server**:
1. `join-room` - Enter planning room
2. `vote` - Submit estimation
3. `reveal` - Show all votes
4. `reestimate` - Start new round
5. `reset` - Full game reset
6. `update-story` - Change story
7. `update-name` - Change name
8. `suspend-voting` - Pause voting
9. `resume-voting` - Resume voting

**Server → Client**:
1. `room-state` - Full sync
2. `participant-voted` - Vote notification
3. `revealed` - Vote reveal
4. `room-reset` - Reset confirmation
5. `story-updated` - Story update

**When to Use**:
- When modifying the WebSocket protocol
- Adding new message types
- For protocol consistency audits
- After server implementation changes
- Before major releases

**Example Usage**:
```
Use websocket-protocol to check consistency between Node and Go servers
```

**Output**:
- Protocol consistency status (✓ Consistent / ⚠ Issues / ✗ Major issues)
- Security analysis with vulnerabilities
- Performance assessment and optimization opportunities
- Test coverage percentage and missing scenarios
- Protocol documentation status
- Recommendations (critical fixes, optimizations, enhancements)

---

## Slash Commands

Slash commands are quick shortcuts for common development tasks. Type `/command-name` to execute.

### /test-all

**File**: `.claude/commands/test-all.md`

**Description**: Run the complete test suite across all components.

**Actions**:
1. Run Golang WebSocket server tests (18 tests)
2. Run Node.js WebSocket server tests (20+ tests)
3. Run React client tests (WebSocket client and hook)
4. Generate coverage reports
5. Provide summary of results and gaps

**When to Use**:
- Before committing changes
- After implementing new features
- During PR reviews
- Before releases

**Example**: `/test-all`

---

### /lint-all

**File**: `.claude/commands/lint-all.md`

**Description**: Run all linting and code quality checks.

**Actions**:
1. Run Biome linting for TypeScript/React
2. Run TypeScript type checking
3. Check for formatting issues
4. Report errors and warnings
5. Suggest auto-fix if applicable

**When to Use**:
- Before committing
- During development
- For code quality checks

**Example**: `/lint-all`

---

### /build-check

**File**: `.claude/commands/build-check.md`

**Description**: Build all components and verify success.

**Actions**:
1. Build Node.js WebSocket server
2. Build Golang WebSocket server
3. Build Next.js frontend
4. Report build times and sizes
5. Check for warnings or errors

**When to Use**:
- Before committing
- After dependency updates
- Before deployment

**Example**: `/build-check`

---

### /security-scan

**File**: `.claude/commands/security-scan.md`

**Description**: Quick security scan of the application.

**Actions**:
1. Run `npm audit` for vulnerabilities
2. Scan Docker images (if available)
3. Check for hardcoded secrets
4. Review WebSocket security
5. Check security headers

**When to Use**:
- Before releases
- After dependency updates
- Periodic security checks

**Example**: `/security-scan`

---

### /dev-setup

**File**: `.claude/commands/dev-setup.md`

**Description**: Help set up development environment.

**Actions**:
1. Verify Node.js version (v24+)
2. Verify Go version (1.24+)
3. Check Docker/Docker Compose
4. Install dependencies
5. Explain development modes
6. Provide next steps

**When to Use**:
- First-time setup
- Onboarding new developers
- After environment changes

**Example**: `/dev-setup`

---

### /architecture-review

**File**: `.claude/commands/architecture-review.md`

**Description**: Provide architecture overview and review.

**Actions**:
1. Explain monorepo structure
2. Describe deployment modes
3. Explain WebSocket protocol
4. Review component hierarchy
5. Compare server implementations
6. Explain Redis integration
7. Suggest improvements

**When to Use**:
- Onboarding new developers
- Before architectural changes
- For documentation purposes

**Example**: `/architecture-review`

---

### /performance-test

**File**: `.claude/commands/performance-test.md`

**Description**: Quick performance analysis.

**Actions**:
1. Analyze bundle size
2. Identify large components
3. React profiling suggestions
4. Load testing approach
5. Connection handling capacity
6. Memory leak checks

**When to Use**:
- When experiencing slow performance
- Before scaling
- After major changes

**Example**: `/performance-test`

---

### /deploy-check

**File**: `.claude/commands/deploy-check.md`

**Description**: Quick deployment readiness check.

**Actions**:
1. Validate Docker configs
2. Check Kubernetes Helm chart
3. Review environment variables
4. Verify health check endpoints
5. Check security hardening
6. Review resource limits

**When to Use**:
- Before deployment
- After infrastructure changes
- For quick validation

**Example**: `/deploy-check`

---

## Usage Guide

### How to Use Skills

Ask Claude to use a specific skill by name:

```
"Use the security-audit skill to check our application"
"I need a performance-check for the frontend"
"Run the test-suite skill and report gaps"
```

Claude will follow the comprehensive framework defined in the skill file.

### How to Use Slash Commands

Type the command directly in your conversation with Claude:

```
/test-all
/security-scan
/architecture-review
```

Claude will immediately execute the command and provide results.

### When to Use What

| Scenario | Recommended Tool |
|----------|-----------------|
| Before production | `security-audit`, `deployment-check`, `/deploy-check` |
| PR review | `code-review`, `/lint-all`, `/test-all` |
| Performance issues | `performance-check`, `/performance-test` |
| New features | `/test-all`, `/build-check` |
| Onboarding | `/dev-setup`, `/architecture-review` |
| Protocol changes | `websocket-protocol` |
| Sprint review | `test-suite`, `code-review` |
| Security audit | `security-audit`, `/security-scan` |
| Quick validation | Slash commands (`/lint-all`, `/build-check`) |
| Deep analysis | Skills (`security-audit`, `performance-check`) |

---

## Best Practices

### For Skills

1. **Use for comprehensive analysis**: Skills provide thorough, in-depth reviews
2. **Allow time**: Expect detailed reports with actionable recommendations
3. **Skills are proactive**: They identify issues you might not have considered
4. **Prioritize findings**: Review by severity and implement high-priority items first
5. **Share results**: Skills generate reports suitable for team reviews

### For Slash Commands

1. **Quick checks**: Use during development for fast feedback
2. **Chain commands**: Run multiple in sequence (`/lint-all`, `/build-check`, `/test-all`)
3. **Pre-commit**: Make commands part of your workflow before committing
4. **Daily routine**: Integrate into development habits
5. **Fast iteration**: Commands are optimized for speed

### Combining Skills and Commands

**Example Workflow**:
```
# Quick check during development
/lint-all
/build-check

# Before commit
/test-all
/security-scan

# Before PR
code-review skill
/test-all

# Before deployment
security-audit skill
deployment-check skill
/deploy-check
```

---

## Customization

### Adding New Skills

1. Create markdown file in `.claude/skills/`
2. Include sections:
   - **Purpose**: What the skill does
   - **Context**: Project-specific information
   - **Tasks to Perform**: Step-by-step framework
   - **Output Format**: How results are presented
   - **Success Criteria**: What defines success
3. Update this documentation

### Adding New Slash Commands

1. Create markdown file in `.claude/commands/`
2. Describe what the command should do
3. List specific steps to execute
4. Define expected output
5. Update this documentation

**Filename becomes command name**: `my-command.md` → `/my-command`

---

## Integration with CLAUDE.md

This file (`CLAUDE_SKILLS.md`) complements `CLAUDE.md`:

- **CLAUDE.md**: AI assistant guide for working with the codebase
  - Architecture overview
  - Technology stack
  - Development workflows
  - Code conventions
  - Common tasks

- **CLAUDE_SKILLS.md** (this file): Specialized analysis tools
  - Security audits
  - Test suite management
  - Performance optimization
  - Code reviews
  - Deployment validation
  - Protocol analysis

Use both documents together for comprehensive AI assistance.

---

## Examples

### Example 1: Pre-Deployment Checklist

```
# Security audit
Use security-audit skill to check for vulnerabilities

# Test coverage
Run test-suite skill to ensure adequate coverage

# Performance validation
Use performance-check to verify targets are met

# Deployment config
Use deployment-check skill for Kubernetes setup

# Quick final checks
/security-scan
/test-all
/build-check
/deploy-check
```

### Example 2: New Feature Development

```
# Start development
/dev-setup

# During development
/lint-all  # Check code quality
/build-check  # Verify builds

# Before PR
/test-all  # Run all tests
code-review skill  # Comprehensive review

# After PR approval
/build-check
/test-all
```

### Example 3: Performance Investigation

```
# Quick check
/performance-test

# Deep analysis
Use performance-check skill to identify all bottlenecks

# Verify improvements
/build-check  # Check bundle size
/test-all  # Ensure no regressions
```

### Example 4: Security Audit

```
# Quick scan
/security-scan

# Comprehensive audit
Use security-audit skill for full security review

# Fix and verify
/security-scan  # Quick recheck
```

---

## Maintenance

### Keeping Skills Current

As the project evolves:

1. **Update existing skills** with new checks and patterns
2. **Add new skills** for emerging concerns (accessibility, database, etc.)
3. **Remove obsolete items** when no longer relevant
4. **Incorporate feedback** from team usage
5. **Update documentation** when skills change

### Version History

- **v1.0.0** (2025-12-25): Initial skill and command setup
  - 6 specialized skills (security, testing, performance, code review, deployment, protocol)
  - 8 slash commands (test, lint, build, security, setup, architecture, performance, deploy)

---

## Contributing

When adding or modifying skills/commands:

1. Follow existing format and structure
2. Be specific about functionality
3. Include clear success criteria
4. Test before committing
5. Update this documentation
6. Get team review for major changes

---

## Resources

- **CLAUDE.md**: AI assistant guide for codebase
- **README.md**: Project architecture and setup
- **TESTING.md**: Test suite documentation
- **.claude/skills/**: Skill definition files
- **.claude/commands/**: Command definition files

---

**Last Updated**: 2025-12-25
**Version**: 1.0.0
**Maintained by**: Planning Poker Development Team
