# Code Review Skill

## Purpose
Perform comprehensive code reviews focusing on architecture, design patterns, code quality, maintainability, and adherence to best practices for TypeScript, React, Next.js, Node.js, and Golang.

## Context
Planning Poker monorepo with:
- **Frontend**: Next.js 16, React 19, TypeScript 5.9
- **Backend**: Node.js WebSocket server + Golang alternative
- **Tooling**: Biome for linting/formatting, Jest for testing
- **Deployment**: Docker, Kubernetes with Helm

## Tasks to Perform

### 1. Architecture Review

**Overall Structure:**
- Evaluate monorepo organization (workspaces)
- Review separation of concerns (frontend/backend)
- Check for circular dependencies
- Assess component hierarchy and data flow

**Questions to answer:**
- Is the architecture scalable?
- Are boundaries between layers clear?
- Is the WebSocket protocol well-defined?
- How is state managed across components?

**Files to review:**
- `/package.json` - Workspace configuration
- `/src/app/**/*` - Frontend structure
- `/servers/node/**/*` - Node.js server structure
- `/servers/golang/**/*` - Golang server structure

### 2. Design Patterns Review

**React Patterns:**
- Component composition vs inheritance
- Custom hooks usage (check `/src/lib/realtime/useRealtime.ts`)
- Context API usage (theme provider)
- Prop drilling vs state management
- Server Components vs Client Components (Next.js 16)

**Backend Patterns:**
- Singleton vs factory patterns for room management
- Observer pattern for WebSocket broadcasts
- Repository pattern (if data persistence added)
- Error handling patterns

**Anti-patterns to flag:**
- God objects (like `results.tsx` at 7000 LOC)
- Tight coupling between components
- Premature optimization
- Code duplication between Node and Golang servers

### 3. Code Quality Analysis

Run linting and formatting tools:

```bash
# Biome linting
npm run lint

# Type checking
npx tsc --noEmit

# Check for dead code
npx ts-prune

# Dependency analysis
npx depcheck
```

**Check for:**
- Consistent code style
- Proper TypeScript types (no `any` usage)
- Meaningful variable/function names
- Appropriate comment usage
- Magic numbers/strings

### 4. TypeScript Best Practices

**Type Safety:**
- Strict mode enabled (`tsconfig.json`)
- No implicit `any`
- Proper interface definitions for WebSocket messages
- Type guards for runtime validation
- Discriminated unions for message types

**Files to review:**
- `/src/lib/realtime/wsClient.ts` - WebSocket message types
- `/src/lib/realtime/useRealtime.ts` - Hook type definitions
- `/servers/node/src/index.ts` - Server-side types

**Example check:**
```typescript
// Good: Discriminated union
type Message =
  | { type: 'vote'; value: string }
  | { type: 'reveal' }
  | { type: 'reset' };

// Bad: Loose typing
type Message = {
  type: string;
  value?: any;
};
```

### 5. React Best Practices

**Component Design:**
- Single Responsibility Principle
- Component size (flag components >300 LOC)
- Props interface clarity
- Default props usage
- Children composition

**Hooks Usage:**
- Dependency arrays correct
- No hooks in conditionals
- Custom hooks properly named (use*)
- `useEffect` cleanup functions

**Performance:**
- Unnecessary re-renders
- Missing `React.memo()` for expensive components
- Large bundle components code-split
- Lazy loading for routes

**Files to review:**
- `/src/app/components/**/*.tsx` - All UI components
- `/src/lib/realtime/useRealtime.ts` - Custom hook

### 6. Next.js 16 Best Practices

**App Router Usage:**
- Server Components vs Client Components
- Proper `'use client'` directives
- Streaming and Suspense usage
- Metadata API usage

**Performance:**
- Image optimization with `next/image`
- Font optimization with `next/font`
- Route prefetching strategy
- Caching strategy

**Files to review:**
- `/src/app/**/*` - App router structure
- `/next.config.ts` - Next.js configuration

### 7. Backend Code Review

**Node.js Server:**
- Async/await error handling
- Memory leak prevention
- WebSocket connection cleanup
- Graceful shutdown implementation

**Golang Server:**
- Goroutine management
- Channel usage and closing
- Mutex usage (RWMutex for read-heavy)
- Error handling patterns
- Context usage for cancellation

**Files to review:**
- `/servers/node/src/index.ts`
- `/servers/golang/main.go`

### 8. Security Code Review

Flag security issues:
- Input validation missing
- XSS vulnerabilities
- Prototype pollution
- Command injection risks
- Secrets in code
- Unsafe deserialization

### 9. Testing Code Review

**Test Quality:**
- Test coverage of critical paths
- Test isolation and independence
- Descriptive test names
- Arrange-Act-Assert pattern
- Proper mocking and stubbing

**Files to review:**
- `/servers/golang/main_test.go`
- `/servers/node/src/index.test.ts`
- `/src/lib/realtime/__tests__/**/*`

### 10. Documentation Review

Check for:
- README completeness
- API documentation
- Inline comments for complex logic
- JSDoc/TSDoc for public APIs
- Architecture decision records (ADRs)

## Review Checklist

### Critical Issues (Must Fix)
- [ ] Security vulnerabilities
- [ ] Type safety violations
- [ ] Memory leaks
- [ ] Race conditions
- [ ] Breaking changes without migration path

### High Priority
- [ ] Performance bottlenecks
- [ ] Code duplication (DRY violations)
- [ ] Missing error handling
- [ ] Accessibility issues
- [ ] Missing critical tests

### Medium Priority
- [ ] Components too large (>300 LOC)
- [ ] Complex functions (cyclomatic complexity >10)
- [ ] Inconsistent naming conventions
- [ ] Missing TypeScript types
- [ ] Code style violations

### Low Priority / Nice to Have
- [ ] Better variable names
- [ ] More comments
- [ ] Refactoring opportunities
- [ ] Additional documentation

## Output Format

Provide a code review report with:

1. **Executive Summary**
   - Overall code quality rating (1-10)
   - Key strengths
   - Critical issues count
   - Recommended priority actions

2. **Detailed Findings**
   - Category (Architecture/Design/Quality/Security/Performance)
   - Severity (Critical/High/Medium/Low)
   - File and line numbers
   - Description of issue
   - Suggested fix with code example

3. **Positive Highlights**
   - Well-designed components
   - Good practices observed
   - Clean code examples

4. **Refactoring Suggestions**
   - Large components to split (e.g., results.tsx)
   - Duplicated code to extract
   - Opportunities for abstraction

5. **Technical Debt Assessment**
   - Current technical debt items
   - Recommended prioritization
   - Estimated effort to address

## Tools to Use

```bash
# Linting
npm run lint

# Type checking
npx tsc --noEmit

# Code complexity
npx eslint . --ext .ts,.tsx --max-warnings 0

# Bundle analysis
npm run build && npx @next/bundle-analyzer

# Dependency vulnerabilities
npm audit
go list -json -m all | nancy sleuth
```

## Success Criteria
- All code files reviewed systematically
- Issues categorized by severity
- Actionable recommendations with code examples
- Positive feedback on good practices
- Clear prioritization for fixes
- Report is constructive and helpful for developers
