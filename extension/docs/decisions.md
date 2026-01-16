# Architecture Decision Records

**Sprint**: Sprint-EXT-A-001
**Module**: Extension
**Date**: 2026-01-16

---

## ADR-001: Hexagonal Architecture Pattern

### Status
ACCEPTED

### Context
The Chrome Extension needs to support:
- Unit testing without Chrome runtime
- Clear separation between business logic and platform specifics
- Future portability to other platforms (Firefox, standalone)

### Decision
Use hexagonal architecture (ports and adapters) pattern:
- **Core**: Pure business logic with zero Chrome API imports
- **Ports**: TypeScript interfaces for external dependencies
- **Adapters**: Chrome-specific implementations

### Consequences
- **Positive**: Core logic testable with Vitest, clear boundaries
- **Negative**: Additional abstraction layer, slightly more verbose
- **Mitigation**: Keep interfaces minimal; complexity only when needed

---

## ADR-002: Service Worker State Persistence

### Status
ACCEPTED

### Context
Chrome service workers can terminate after ~30 seconds of inactivity. State stored in JavaScript variables is lost.

### Decision
Persist all state to `chrome.storage.session` after every state change:
- Use atomic updates to prevent partial state
- Set keep-alive alarm during active runs
- Implement recovery logic on service worker restart

### Consequences
- **Positive**: State survives service worker termination
- **Negative**: Increased storage I/O, slight latency
- **Mitigation**: Debounce rapid state changes; use efficient serialization

---

## ADR-003: Message-Based DOM Operations

### Status
ACCEPTED

### Context
Core logic runs in service worker but DOM access requires content scripts. Need reliable communication pattern.

### Decision
Use one-shot message passing (not ports) for DOM operations:
- Service worker sends request message
- Content script extracts data from DOM
- Content script sends response with data

### Alternatives Considered
- **Long-lived ports**: More complex, harder to recover from termination
- **Direct DOM access**: Not possible from service worker

### Consequences
- **Positive**: Stateless content scripts, easy to recover
- **Negative**: Overhead per operation, potential timeouts
- **Mitigation**: Set reasonable timeouts, implement retry logic

---

## ADR-004: Session Storage for API Key

### Status
ACCEPTED

### Context
Anthropic API key is sensitive and must be protected. Options:
1. Local storage (persists forever)
2. Session storage (cleared on browser close)
3. Prompt each run (never stored)

### Decision
Use `chrome.storage.session`:
- Cleared when browser closes
- Available for entire session
- Balance between security and usability

### Consequences
- **Positive**: Key not persisted long-term, reasonable UX
- **Negative**: User must re-enter on browser restart
- **Mitigation**: Clear prompt on first run; remember that key is needed

---

## ADR-005: Manual Login Instead of Automated

### Status
ACCEPTED

### Context
Auchan.pt uses Salesforce OAuth for login. Options:
1. Automate login flow (enter credentials)
2. User logs in manually, extension detects

### Decision
User logs in manually; extension detects login state:
- Content script checks for logged-in indicators
- Reports login state to service worker
- Extension prompts user if not logged in

### Rationale
- **Security**: Never handle user credentials
- **Complexity**: OAuth flow is complex and may change
- **Reliability**: Manual login always works

### Consequences
- **Positive**: No credential handling, simpler, more reliable
- **Negative**: Extra step for user
- **Mitigation**: Clear prompts; session persists in browser

---

## ADR-006: Graceful LLM Degradation

### Status
ACCEPTED

### Context
LLM enhances decisions but may be unavailable (no API key, rate limited, errors).

### Decision
Always fall back to heuristics when LLM is unavailable:
- Run heuristics first (fast, free)
- Attempt LLM enhancement
- On LLM failure, use heuristic results
- Notify user of degraded mode

### Consequences
- **Positive**: Extension always works, never blocked by LLM
- **Negative**: Lower quality decisions without LLM
- **Mitigation**: Heuristics are already good; LLM is enhancement

---

## ADR-007: No Checkout State in State Machine

### Status
ACCEPTED (CRITICAL)

### Context
The "never auto-purchase" constraint is the most important safety rule.

### Decision
The state machine explicitly excludes any checkout-related states:
- No `checkout`, `payment`, or `confirming` states
- REVIEW state is terminal for automation
- User must manually complete purchase in browser

### Implementation
```typescript
// ALLOWED states
type RunStatus = 'idle' | 'running' | 'paused' | 'review' | 'complete';

// FORBIDDEN (do not exist)
// - 'checkout'
// - 'purchasing'
// - 'confirming-order'
```

### Consequences
- **Positive**: Impossible to accidentally auto-purchase
- **Negative**: User must complete purchase manually
- **Mitigation**: Clear UI to hand off to user; this is the expected flow

---

## ADR-008: Shared Library Extraction

### Status
ACCEPTED

### Context
Significant code can be reused between extension and original project.

### Decision
Extract pure business logic to `src/shared/`:
- Scoring algorithms
- Zod schemas
- Utility functions
- LLM prompts

Both extension and original project import from shared.

### Consequences
- **Positive**: No code duplication, single source of truth
- **Negative**: Build complexity, dependency management
- **Mitigation**: Use TypeScript path aliases; keep shared code simple

---

## ADR-009: Content Script Statelessness

### Status
ACCEPTED

### Context
Content scripts could maintain state, but this complicates recovery and debugging.

### Decision
Content scripts are stateless:
- All state lives in service worker
- Content scripts only extract/manipulate DOM
- No persistent state in content scripts

### Consequences
- **Positive**: Easy to recover, simple mental model
- **Negative**: More messages between components
- **Mitigation**: Efficient message passing; batch operations when possible

---

## ADR-010: Error Classification Hierarchy

### Status
ACCEPTED

### Context
Need consistent error handling across the extension.

### Decision
Use two-level error classification:
1. **Category**: Broad grouping (network, dom, state, chrome, llm, auth)
2. **Type**: Specific error (NETWORK_TIMEOUT, DOM_ELEMENT_NOT_FOUND, etc.)

Each error type has:
- Recovery strategy (immediate, exponential, user-initiated, skip, abort)
- User-facing message
- Technical details for logging

### Consequences
- **Positive**: Consistent handling, good UX
- **Negative**: Maintenance overhead
- **Mitigation**: Centralized error definitions; typed error handling

---

*Decisions recorded: 2026-01-16*
*Sprint: Sprint-EXT-A-001, Task: T007*
