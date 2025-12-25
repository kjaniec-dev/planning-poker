# Test Suite Skill

## Purpose
Run comprehensive test suites across all components (Golang server, Node.js server, React client), report coverage, identify gaps, and suggest improvements.

## Context
The project has 38+ tests across three main areas:
- **Golang WebSocket Server**: 18 tests (`servers/golang/main_test.go`)
- **Node.js WebSocket Server**: 20 tests (`servers/node/src/index.test.ts`)
- **React Client**: WebSocket client and useRealtime hook tests

## Tasks to Perform

### 1. Run All Test Suites

Execute all tests and collect results:

```bash
# Run Golang tests
cd servers/golang
go test -v -cover -coverprofile=coverage.out
go tool cover -func=coverage.out

# Run Node.js server tests
cd ../../servers/node
npm test -- --coverage

# Run React client tests
cd ../..
npm test -- --coverage --testPathPattern="src/lib/realtime"

# Run all React tests
npm test -- --coverage
```

### 2. Coverage Analysis

For each test suite, analyze:
- **Line Coverage**: Percentage of code lines executed
- **Branch Coverage**: Percentage of conditional branches tested
- **Function Coverage**: Percentage of functions called
- **Uncovered Code**: Identify critical paths not tested

**Target Coverage:**
- Critical paths (WebSocket protocol): 100%
- Core business logic: ≥90%
- UI components: ≥80%
- Overall: ≥85%

### 3. Identify Testing Gaps

Look for untested scenarios:
- **Edge Cases**: Empty rooms, invalid messages, network failures
- **Concurrency**: Multiple simultaneous operations
- **Performance**: Large number of participants, message flooding
- **Integration**: End-to-end flows across client and server
- **UI Components**: Missing component tests in `/src/app/components/`

**Components needing tests:**
- `/src/app/components/voting-cards.tsx`
- `/src/app/components/results.tsx` (7000+ LOC - critical)
- `/src/app/components/participants.tsx`
- `/src/app/components/story-info.tsx`
- `/src/app/components/confirm-dialog.tsx`

### 4. Test Quality Review

Evaluate existing tests for:
- **Clarity**: Are test names descriptive?
- **Isolation**: Do tests run independently?
- **Assertions**: Are assertions specific and meaningful?
- **Mocking**: Is mocking appropriate and not over-used?
- **Speed**: Are tests fast enough for CI/CD?

### 5. Suggest New Tests

Recommend additional tests for:
- **Load Testing**: Simulate 100+ concurrent users
- **Stress Testing**: Push system to failure limits
- **Integration Tests**: Full client-server-Redis flow
- **Visual Regression**: UI component appearance tests
- **Accessibility**: ARIA labels, keyboard navigation

### 6. CI/CD Integration

Suggest improvements for:
- Automated test execution on PR
- Coverage reporting in PRs
- Test result visualization
- Performance benchmarking over time

## Commands Reference

```bash
# Run all tests in parallel
npm test -- --maxWorkers=4

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- wsClient.test.ts

# Golang benchmarks
cd servers/golang && go test -bench=. -benchmem
```

## Output Format

Provide a test report with:

1. **Test Execution Summary**
   - Total tests run
   - Passed/Failed/Skipped
   - Execution time

2. **Coverage Report**
   - Overall coverage percentage
   - Per-component breakdown
   - Uncovered critical paths

3. **Testing Gaps**
   - List of untested components
   - Missing test scenarios
   - Priority ranking

4. **Recommendations**
   - New tests to write (prioritized)
   - Test infrastructure improvements
   - CI/CD enhancements

## Success Criteria
- All test suites execute successfully
- Coverage metrics clearly reported
- Critical gaps identified with priority
- Actionable recommendations provided
- Report suitable for sprint planning
