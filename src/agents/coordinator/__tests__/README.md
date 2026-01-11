# Coordinator Agent Tests

This directory contains tests for the Coordinator agent, organized by test type.

## Test Files

| File | Type | Purpose |
|------|------|---------|
| `coordinator.integration.test.ts` | Integration | Tests Coordinator with mocked CartBuilder and LoginTool |
| `coordinator.e2e.test.ts` | E2E | Tests Coordinator with real Playwright browser automation |
| `parallel-worker.test.ts` | Unit | Tests parallel worker coordination (Phase 2+ prep) |
| `persistence.test.ts` | Integration | Tests session persistence and recovery |

## E2E Tests

The E2E test suite (`coordinator.e2e.test.ts`) includes two categories of tests:

### 1. Mocked Tests (Always Run)

These tests use mocked Playwright pages and always run in CI and local development:

- **Session State Verification** - Tests session initialization, state transitions, metadata tracking
- **Screenshot Capture** - Verifies screenshot tracking and error handling
- **Error Recovery** - Tests timeout handling, retry logic, error classification
- **Review Pack Structure** - Validates Review Pack generation
- **Timeout Handling** - Tests session timeout enforcement and cleanup
- **Safety Boundaries** - Verifies coordinator never navigates to checkout/payment
- **Performance** - Validates timing and duration tracking

**To run mocked tests:**

```bash
npm run test:run -- src/agents/coordinator/__tests__/coordinator.e2e.test.ts
```

### 2. Real Browser Tests (Skipped by Default)

These tests use real Playwright browser automation against Auchan.pt and are skipped by default. They require:

- Real Auchan.pt credentials
- Environment variable `RUN_E2E_TESTS=true`
- Environment variables `AUCHAN_EMAIL` and `AUCHAN_PASSWORD`

**Test scenarios:**
- Complete Coordinator flow with real CartBuilder
- Login to Auchan.pt
- Screenshot capture at key steps
- Session state transitions verification

**To run real browser tests locally:**

```bash
# Set environment variables
export RUN_E2E_TESTS=true
export AUCHAN_EMAIL=your-email@example.com
export AUCHAN_PASSWORD=your-password

# Run tests
npm run test:run -- src/agents/coordinator/__tests__/coordinator.e2e.test.ts
```

**Security Note:** Never commit credentials. Use `.env` files (gitignored) or secure credential storage.

### Screenshots

Real browser tests capture screenshots in:
```
screenshots/coordinator-e2e/
  ├── e2e-test-{timestamp}-initial.png
  ├── e2e-test-{timestamp}-final.png
  ├── e2e-screenshots-{timestamp}-{step}.png
  └── ...
```

## Test Patterns

### Conditional Test Execution

The E2E suite uses Vitest's `.skipIf()` to conditionally skip tests:

```typescript
it.skipIf(!canRunRealBrowserTests())(
  'should complete full Coordinator flow with real browser',
  async () => {
    // Test implementation
  }
);
```

This allows:
- ✅ CI runs mocked tests (fast, no credentials)
- ✅ Local dev runs mocked tests by default
- ✅ Local dev can opt-in to real browser tests with env vars

### Browser Lifecycle Management

Real browser tests properly manage browser lifecycle:

```typescript
beforeAll(async () => {
  if (canRunRealBrowserTests()) {
    browser = await chromium.launch({ headless: process.env.CI === 'true' });
  }
});

afterAll(async () => {
  if (browser) {
    await browser.close(); // ALWAYS close browser
  }
});
```

## Running Tests in CI

In CI environments:

```bash
# Run all tests (E2E mocked tests will run, real browser tests will skip)
npm run test:run

# Run E2E tests with real browser (requires secrets configured in CI)
RUN_E2E_TESTS=true AUCHAN_EMAIL=$AUCHAN_EMAIL AUCHAN_PASSWORD=$AUCHAN_PASSWORD npm run test:run
```

## Test Coverage

| Category | Coverage |
|----------|----------|
| Session Management | ✅ Initialization, state transitions, metadata |
| Worker Delegation | ✅ CartBuilder delegation, result handling |
| Error Handling | ✅ Timeout, retry, error classification |
| Review Pack | ✅ Generation, structure, warnings, confidence |
| Screenshots | ✅ Capture, tracking, error handling |
| Safety | ✅ Never navigates to checkout/payment |
| Performance | ✅ Duration tracking, timing |

## Debugging

### View Test Output

```bash
npm run test:run -- src/agents/coordinator/__tests__/coordinator.e2e.test.ts --reporter=verbose
```

### Run Specific Test

```bash
npm run test:run -- src/agents/coordinator/__tests__/coordinator.e2e.test.ts -t "should complete full Coordinator flow"
```

### Watch Mode

```bash
npm run test -- src/agents/coordinator/__tests__/coordinator.e2e.test.ts
```

## Best Practices

1. **Always close browsers** - Use `afterAll()` to ensure browser cleanup
2. **Use short timeouts for mocked tests** - Fast feedback loop
3. **Use reasonable timeouts for real browser tests** - Real network latency
4. **Capture screenshots on failures** - Essential for debugging real browser tests
5. **Never commit credentials** - Use environment variables
6. **Keep mocked tests fast** - They run in CI on every commit
7. **Keep real browser tests optional** - They're for local verification

## Troubleshooting

### Tests timeout

- Check network connectivity
- Increase timeout in test (3rd parameter to `it()`)
- Verify Auchan.pt is accessible

### Screenshots not captured

- Check `screenshots/coordinator-e2e/` directory exists
- Verify write permissions
- Check browser launched successfully

### Real browser tests not running

- Verify `RUN_E2E_TESTS=true` is set
- Verify credentials are set: `AUCHAN_EMAIL`, `AUCHAN_PASSWORD`
- Check test output for skip messages

### Browser not closing

- Check `afterAll()` is called
- Verify no lingering browser processes: `ps aux | grep chromium`
- On Windows: Task Manager → Details → Look for chromium/playwright processes
