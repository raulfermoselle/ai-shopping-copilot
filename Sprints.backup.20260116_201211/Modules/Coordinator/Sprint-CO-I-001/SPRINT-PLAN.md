# Sprint-CO-I-001: Implement Phase 1 Coordinator

**Module:** Coordinator
**Type:** Implementation (I)
**Status:** Active
**Started:** 2026-01-11
**Target Completion:** 2026-01-13
**Dependencies:** Sprint-CO-A-001 ✅, Sprint-G-002 ✅ (Login tools), Sprint-CB-I-001 ✅ (CartBuilder implementation)

---

## Objective

Implement the Phase 1 Coordinator as defined in Sprint-CO-A-001 architecture. The Coordinator orchestrates the cart preparation session by:

1. Managing session lifecycle and state transitions
2. Delegating to CartBuilder worker with timeout/retry protection
3. Integrating login tools from Sprint-G-002
4. Generating Review Pack with confidence scoring
5. Providing integration tests and E2E test coverage
6. Enabling Control Panel to invoke the Coordinator

**Success Definition:** Coordinator can execute a complete Phase 1 session (login → load/merge cart → generate review pack) with full test coverage.

---

## Key Context from CO-A-001

| Artifact | Location | Status |
|----------|----------|--------|
| Coordinator types with Zod schemas | `src/agents/coordinator/types.ts` | Implemented (420 lines) |
| Coordinator class skeleton | `src/agents/coordinator/coordinator.ts` | Implemented (500 lines) |
| Worker delegation pattern | `src/agents/coordinator/coordinator.ts` | Has timeout/retry mechanism |
| Review Pack generation | `src/agents/coordinator/coordinator.ts` | Implemented with confidence scoring |
| Module documentation | `docs/modules/coordinator.md` | Completed |

**What's Done in CO-A-001:**
- Session state machine (initializing → authenticating → loading_cart → generating_review → review_ready)
- CartBuilder worker delegation with timeout/retry
- Review Pack format and generation algorithm
- Error classification and recovery tracking
- Safety guardrail: Agent NEVER places orders

**What Remains (This Sprint):**
- Integration tests for coordinator lifecycle
- E2E tests with actual browser automation
- Login integration (connecting Sprint-G-002 tools)
- Control Panel API integration
- Session persistence and recovery
- Parallel worker execution framework (Phase 2 prep)

---

## Tasks

| Task | Description | Status |
|------|-------------|--------|
| T001 | Build integration tests for Coordinator | Pending |
| T002 | Implement session persistence and recovery | Pending |
| T003 | Integrate login tools from Sprint-G-002 | Pending |
| T004 | Build E2E tests with browser automation | Pending |
| T005 | Create Control Panel API integration layer | Pending |
| T006 | Parallel worker execution framework (Phase 2 prep) | Pending |

---

## T001: Coordinator Integration Tests

**Objective:** Verify Coordinator lifecycle and state transitions work correctly.

**Files to Create:**
- `src/agents/coordinator/__tests__/coordinator.integration.test.ts`

**Test Coverage:**

1. **Session Initialization**
   - Create session with valid config
   - Verify session ID, startTime, status='initializing'
   - Test with missing required fields (should fail validation)

2. **State Transitions**
   - initializing → authenticating (without login yet)
   - authenticating → loading_cart
   - loading_cart → generating_review
   - generating_review → review_ready
   - Error path: any state → cancelled

3. **CartBuilder Delegation**
   - Mock CartBuilder and call delegateToCartBuilder()
   - Verify CartBuilderResult stored in session.workers.cartBuilder
   - Verify error handling when CartBuilder fails
   - Verify timeout protection (executeWithTimeout)
   - Verify retry mechanism (up to maxRetries attempts)

4. **Review Pack Generation**
   - Call generateReviewPack() after CartBuilder succeeds
   - Verify ReviewPack contains:
     - sessionId, generatedAt, householdId
     - cart.summary, cart.diff, cart.before, cart.after
     - warnings array (empty for success case)
     - confidence scores (cartAccuracy, dataQuality)
   - Verify warnings are generated for out-of-stock items

5. **Error Recovery**
   - Inject transient error (timeout)
   - Verify retry attempt count increments
   - Verify error recorded with recoveryAttempted=true
   - Verify successful recovery after retry

6. **Configuration**
   - Verify CoordinatorConfig validation with Zod
   - Test merge strategy override ('latest' vs 'combined')
   - Test order count limits

**Success Criteria:**
- 100% of Coordinator public methods have integration tests
- State machine paths fully tested
- Error recovery patterns verified
- All tests pass with mocked CartBuilder

---

## T002: Session Persistence and Recovery

**Objective:** Enable session resumption after interruption (network failure, browser crash, etc.)

**Files to Create/Modify:**
- `src/agents/coordinator/persistence.ts` (new)
- `src/agents/coordinator/recovery.ts` (new)
- `src/agents/coordinator/__tests__/persistence.test.ts` (new)

**Implementation Details:**

1. **Session Serialization**
   - Create `serializeSession()`: Convert CoordinatorSession to JSON
   - Exclude non-serializable data (Page object, browser references)
   - Include screenshot paths instead of binary data

2. **Session Storage**
   - Store session at `{projectRoot}/sessions/{sessionId}.json`
   - Atomic write with temp file + rename pattern
   - Include metadata (created, lastUpdated, status)

3. **Session Recovery**
   - Create `loadSession(sessionId)`: Deserialize from storage
   - Validate session data with schema
   - Return CoordinatorSession with restored state

4. **Resumption Logic**
   - If session.status === 'loading_cart', resume CartBuilder delegation
   - If session.status === 'generating_review', regenerate Review Pack
   - If session.status === 'review_ready', return existing Review Pack
   - Clear cancelled/failed sessions after 24 hours

5. **Integration with Coordinator.run()**
   - Check for existing session by sessionId
   - If found and resumable, load and continue
   - If found and non-resumable, create new session
   - Save session after each status transition

**Success Criteria:**
- Session can be saved after each state transition
- Session can be loaded and verified
- Coordinator can resume from mid-session state
- Stale sessions cleaned up automatically

---

## T003: Login Tool Integration

**Objective:** Connect login tools from Sprint-G-002 to Coordinator authentication.

**Files to Modify:**
- `src/agents/coordinator/coordinator.ts` (update `loginToAuchan()` method)
- `src/agents/coordinator/__tests__/coordinator.integration.test.ts` (add login tests)

**Implementation Details:**

1. **Import Login Tools**
   - Import LoginToolResult from `src/systems/browser-automation/login.ts`
   - Import session persistence utilities from Sprint-G-002

2. **Update loginToAuchan() Method**
   - Currently: `// Phase 1: Assumed logged in`
   - New: Actual login execution
   - Call login tool with credentials (from context or config)
   - Verify session persistence set correctly
   - Store authentication token in session metadata

3. **Error Handling**
   - Handle login failures (invalid credentials, locked account, etc.)
   - Classify as non-retryable errors
   - Record error with severity='error' or 'fatal'

4. **Session State**
   - After successful login: updateStatus('loading_cart')
   - On failed login: updateStatus('cancelled'), record error

5. **Testing**
   - Mock login tool success case
   - Mock login tool failure case
   - Verify session state after login
   - Verify error recording on failure

**Success Criteria:**
- Coordinator calls actual login tool (not skipped)
- Login success transitions to loading_cart
- Login failure is recorded and blocks further execution
- Session includes authentication metadata

---

## T004: E2E Tests with Browser Automation

**Objective:** Test Coordinator with actual Playwright browser automation.

**Files to Create:**
- `src/agents/coordinator/__tests__/coordinator.e2e.test.ts`

**Test Strategy:**

1. **Test Environment Setup**
   - Use `AUCHAN_USERNAME` and `AUCHAN_PASSWORD` from env
   - Skip tests if credentials not available
   - Use sandboxed/test Auchan account if available

2. **Happy Path E2E**
   - Create Coordinator instance with real config
   - Call coordinator.run()
   - Verify: Login succeeds → CartBuilder executes → ReviewPack generated
   - Verify final session.status === 'review_ready'
   - Verify ReviewPack contains valid cart data
   - Capture screenshots for documentation

3. **Network Failure E2E**
   - Simulate network failure during CartBuilder
   - Verify timeout triggers after sessionTimeout
   - Verify retry mechanism attempts recovery
   - Verify proper error recording

4. **Browser State Recovery E2E**
   - Start session, progress to loading_cart
   - Close browser unexpectedly
   - Save session state
   - Create new Coordinator, load session
   - Verify can resume from saved state
   - Complete session successfully

5. **Cart Diff Validation E2E**
   - Load known previous order
   - Verify CartBuilder detects changes
   - Verify ReviewPack includes correct diff
   - Verify confidence scores reflect data quality

**Success Criteria:**
- E2E test suite passes with real browser
- Happy path validates complete session
- Error scenarios handled gracefully
- Screenshots captured for user review

---

## T005: Control Panel API Integration

**Objective:** Create API layer that Control Panel can invoke to start Coordinator sessions.

**Files to Create:**
- `src/api/coordinator-api.ts` (new)
- `src/api/__tests__/coordinator-api.test.ts` (new)

**API Design:**

```typescript
// POST /api/coordinator/session/start
// Body: { householdId, username, config?: CoordinatorConfig }
// Response: { sessionId, status, reviewPack? }

// GET /api/coordinator/session/{sessionId}
// Response: { sessionId, status, reviewPack, progress }

// POST /api/coordinator/session/{sessionId}/approve
// Body: { approvalData, modifications? }
// Response: { orderId, status }

// POST /api/coordinator/session/{sessionId}/cancel
// Response: { sessionId, status: 'cancelled' }
```

**Implementation Details:**

1. **Session Startup**
   - Validate input parameters
   - Create Coordinator instance
   - Call coordinator.run() (async)
   - Return sessionId immediately (don't wait for completion)
   - Track session in background

2. **Session Status Query**
   - Load session from persistence
   - Return current status and progress
   - Include ReviewPack if ready

3. **User Approval Handling**
   - Receive user approval/modifications
   - Validate modifications (quantities, removals, etc.)
   - **IMPORTANT**: Do NOT submit order (safety guardrail)
   - Store approval data in session
   - Return success confirmation

4. **Session Cancellation**
   - Update session status to 'cancelled'
   - Record cancellation reason
   - Clean up resources

**Success Criteria:**
- Control Panel can start a session and receive sessionId
- Control Panel can poll session status
- Control Panel can submit approvals
- No actual orders are submitted by API

---

## T006: Parallel Worker Execution Framework (Phase 2 Prep)

**Objective:** Design and prototype the framework for Phase 2 parallel worker execution.

**Files to Create:**
- `src/agents/coordinator/parallel-worker.ts` (new, design only)
- `src/agents/coordinator/__tests__/parallel-worker.test.ts` (new, design tests)

**Design Details:**

1. **Worker Execution Model**
   ```typescript
   interface WorkerTask {
     workerId: string;      // 'cartBuilder', 'substitution', etc.
     config: WorkerConfig;
     timeout: number;
     maxRetries: number;
     priority: number;      // 0=highest
   }

   interface WorkerResult {
     workerId: string;
     success: boolean;
     durationMs: number;
     result?: unknown;
     error?: CoordinatorError;
   }
   ```

2. **Execution Patterns**
   - Sequential (Phase 1): Execute CartBuilder alone
   - Parallel (Phase 2): Execute CartBuilder + Substitution + StockPruner + SlotScout
   - Cascading: Substitution depends on CartBuilder results
   - Fallback: If SlotScout fails, use default slot

3. **Concurrent Execution**
   - Use `Promise.allSettled()` for parallel workers
   - Respect maxConcurrency limit
   - Track aggregate timeout

4. **Result Aggregation**
   - Merge results from multiple workers
   - Detect conflicts (shouldn't happen in current design)
   - Update session.workers for each worker type
   - Handle partial failures gracefully

5. **Testing**
   - Unit tests for WorkerTask validation
   - Unit tests for sequential execution (current behavior)
   - Unit tests for parallel execution logic (mockable)
   - Integration tests verify real workers can execute in parallel

**Success Criteria:**
- Framework designed and documented
- Prototype tests pass with mocked workers
- Can handle sequential (Phase 1) and parallel (Phase 2) modes
- No changes to Phase 1 execution (backward compatible)

---

## Implementation Priority

1. **T001** (Integration Tests) - Validate architecture works
2. **T002** (Session Persistence) - Enable recovery from failures
3. **T003** (Login Integration) - Complete authentication
4. **T004** (E2E Tests) - Verify with real browser
5. **T005** (Control Panel API) - Enable user interaction
6. **T006** (Parallel Framework) - Phase 2 preparation

---

## Key Files to Modify/Create

### Core Implementation
- `src/agents/coordinator/coordinator.ts` (update loginToAuchan)
- `src/agents/coordinator/persistence.ts` (new)
- `src/agents/coordinator/recovery.ts` (new)
- `src/agents/coordinator/parallel-worker.ts` (new design)

### Testing
- `src/agents/coordinator/__tests__/coordinator.integration.test.ts` (new)
- `src/agents/coordinator/__tests__/coordinator.e2e.test.ts` (new)
- `src/agents/coordinator/__tests__/persistence.test.ts` (new)
- `src/agents/coordinator/__tests__/parallel-worker.test.ts` (new design)

### API/Integration
- `src/api/coordinator-api.ts` (new)
- `src/api/__tests__/coordinator-api.test.ts` (new)

### Documentation
- Update `docs/modules/coordinator.md` with E2E test results
- Add session persistence design doc
- Add API specification

---

## Success Criteria

- [x] Sprint directory created with SPRINT-PLAN.md and SPRINT-LOG.md
- [ ] All 6 tasks implemented and tested
- [ ] TypeScript build passes (`npm run build`)
- [ ] All unit tests pass (`npm run test:run`)
- [ ] E2E tests pass with real browser (`npm run test:e2e`)
- [ ] Integration with Sprint-G-002 login tools verified
- [ ] Control Panel can invoke Coordinator and receive sessionId
- [ ] Session can be interrupted and resumed
- [ ] No test failures or TODOs left in code

---

## Dependencies & Blockers

### Unblocked By
- Sprint-CO-A-001 ✅ (Coordinator types and architecture)
- Sprint-CB-I-001 ✅ (CartBuilder implementation)
- Sprint-G-002 ✅ (Login tools)

### Blocking
- Sprint-CP-I-001 (Control Panel implementation) waits for this
- Sprint-SU-I-001 (Substitution implementation) waits for Phase 2 framework

---

## Notes

- **Safety**: Purchase prevention guardrail is critical - review in all code paths
- **Context**: Coordinator is the orchestrator - must handle worker failures gracefully
- **Scope**: Phase 1 focuses on single CartBuilder - Phase 2 adds parallel workers
- **Testing**: E2E tests require real Auchan account - use test credentials
- **Performance**: Parallel execution framework design (T006) unblocks Phase 2 work

---

*Created: 2026-01-11*
