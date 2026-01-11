# Control Panel Module

**Module ID:** CP
**Type:** User Interface Layer
**Status:** Architecture Design (Sprint-CP-A-001)

---

## Overview

The Control Panel is the user-facing interface for the AI Shopping Copilot. It provides session management, progress monitoring, and Review Pack presentation for cart approval.

### Design Principles

1. **CLI-First**: Start with a terminal interface for rapid iteration
2. **Separation of Concerns**: Renderer layer decoupled from business logic
3. **Progress Visibility**: Real-time feedback on agent activity
4. **Minimal Interaction**: Review Pack should be self-explanatory

### Safety Constraint

**CRITICAL:** The Control Panel displays the Review Pack and collects user decisions, but NEVER triggers automatic purchases. The user must manually complete checkout on Auchan.pt after approval.

---

## Architecture Decision: CLI-First

### ADR-CP-001: CLI vs Web UI

**Status:** Accepted

**Context:**
- Phase 2 goal is a working, minimal Control Panel
- Progress visibility is more important than polish
- Development velocity matters more than visual appeal
- The API layer already exists (`src/api/coordinator-api.ts`)

**Decision:**
Start with a CLI interface, designed with a clean renderer abstraction that enables future Web UI addition.

**Consequences:**
- Faster time-to-value (no frontend build toolchain)
- Terminal-friendly for developer testing
- Renderer interface enables Web UI in Phase 3
- Limited visual richness (no charts, no click interactions)

**Alternatives Considered:**
1. **Web UI only**: Higher upfront cost, more infrastructure
2. **Both simultaneously**: Splits focus, delays delivery
3. **Electron app**: Overkill for current needs

---

## Component Architecture

```
                          User
                           |
                           v
+----------------------------------------------------------+
|                    Control Panel CLI                      |
|  +------------------+  +------------------+               |
|  |  SessionManager  |  |    CLIRenderer   |               |
|  |  (orchestration) |  |  (presentation)  |               |
|  +------------------+  +------------------+               |
+----------------------------------------------------------+
           |                       |
           v                       v
+------------------+      +------------------+
|   Coordinator    |      |  ReviewPackView  |
|      API         |      |   (formatter)    |
+------------------+      +------------------+
           |
           v
+------------------+
|   Coordinator    |
|     Agent        |
+------------------+
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **SessionManager** | Start/stop sessions, poll status, handle credentials |
| **CLIRenderer** | Terminal output formatting, progress bars, tables |
| **ReviewPackView** | Transform ReviewPack into displayable sections |
| **CoordinatorAPI** | REST handlers for session lifecycle (exists) |

---

## User Flow

### Happy Path

```
1. USER: Start session
   └── Provide Auchan credentials (email)
   └── Select preferences (order count, merge strategy)

2. SYSTEM: Initialize session
   └── Display session ID
   └── Show progress: "Initializing..."

3. SYSTEM: Authentication
   └── Show progress: "Authenticating..."
   └── Display: "Session restored for [name]"

4. SYSTEM: Cart Building
   └── Show progress: "Loading cart (0/3 orders)..."
   └── Update: "Loading cart (1/3 orders)..."
   └── Update: "Loading cart (2/3 orders)..."
   └── Complete: "Cart loaded: 24 items, EUR 87.50"

5. SYSTEM: Review Generation
   └── Show progress: "Generating review..."
   └── Complete: "Review Pack ready"

6. SYSTEM: Display Review Pack
   └── Cart Summary (item count, total)
   └── Changes Section (added, removed, quantity changes)
   └── Warnings Section (out of stock, price changes)
   └── Confidence Score

7. USER: Review and Decide
   └── Option A: Approve cart
   └── Option B: Reject cart
   └── Option C: Cancel session

8. SYSTEM: Complete
   └── Display: "Cart approved. Ready for manual checkout."
   └── Provide link to Auchan.pt cart page
```

### Error Flow

```
1. If authentication fails:
   └── Display error message
   └── Offer retry or cancel

2. If cart building fails:
   └── Display error context
   └── Show partial results if available
   └── Offer retry or cancel

3. If session times out:
   └── Display timeout message
   └── Show last known state
   └── Offer retry
```

---

## Review Pack Display Format

### CLI Output Structure

```
================================================================================
                         REVIEW PACK - Session sess_abc123
================================================================================

Generated: 2026-01-11 15:30:45
Household: household-001
Confidence: 92% (High)

--------------------------------------------------------------------------------
                                  CART SUMMARY
--------------------------------------------------------------------------------

  Total Items: 24
  Total Price: EUR 87.50
  Source Orders: ORD-001, ORD-002

--------------------------------------------------------------------------------
                                   CHANGES
--------------------------------------------------------------------------------

ADDED (12 items):
  + Leite Mimosa UHT Meio Gordo 1L              x2    EUR 1.29    EUR 2.58
  + Pao de Forma Integral Bimbo                 x1    EUR 2.49    EUR 2.49
  + Iogurte Danone Natural                      x4    EUR 0.89    EUR 3.56
  ...

REMOVED (0 items):
  (none)

QUANTITY CHANGED (2 items):
  ~ Ovos Classe M                          2 -> 6    EUR 2.19    EUR 13.14
    Reason: Combined from multiple orders
  ~ Agua Luso 6x1.5L                       1 -> 2    EUR 3.99    EUR 7.98
    Reason: Combined from multiple orders

UNCHANGED (10 items):
  = Banana Cavendish kg                         x1    EUR 1.99    EUR 1.99
  = Macarrao Esparguete Milaneza               x2    EUR 0.99    EUR 1.98
  ...

--------------------------------------------------------------------------------
                                  WARNINGS
--------------------------------------------------------------------------------

[!] OUT OF STOCK: "Queijo Flamengo Fatiado 200g"
    Consider finding a substitute.

[!] PRICE CHANGE: "Cafe Delta Lote Chavena 250g"
    Was EUR 3.49, now EUR 3.79 (+8.6%)

--------------------------------------------------------------------------------
                                   ACTIONS
--------------------------------------------------------------------------------

[A] Approve cart and proceed to checkout review
[R] Reject cart and start over
[C] Cancel session

Enter choice (A/R/C): _
```

### Sections Explained

| Section | Content | Phase |
|---------|---------|-------|
| **Header** | Session ID, timestamp, household, confidence | 1 |
| **Cart Summary** | Item count, total price, source orders | 1 |
| **Changes** | Added, removed, quantity changed, unchanged items | 1 |
| **Warnings** | Out of stock, price changes, data quality issues | 1 |
| **Substitutions** | Proposed replacements for unavailable items | 2 |
| **Pruning** | Items suggested for removal (recently bought) | 2 |
| **Delivery Slots** | Available slot options with preferences | 2 |
| **Actions** | Approve, reject, cancel options | 1 |

---

## API Endpoints (Existing)

The Control Panel uses the existing Coordinator API:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/coordinator/session/start` | Start new session |
| GET | `/api/coordinator/session/:id` | Get session status |
| GET | `/api/coordinator/session/:id/review-pack` | Get Review Pack |
| POST | `/api/coordinator/session/:id/approve` | Approve cart |
| POST | `/api/coordinator/session/:id/cancel` | Cancel session |

### Start Session Request

```typescript
{
  username: string;       // Auchan email
  householdId: string;    // Household identifier
  config?: {
    maxOrdersToLoad?: number;
    mergeStrategy?: 'latest' | 'combined';
    // ... other options
  }
}
```

### Session Status Response

```typescript
{
  sessionId: string;
  status: SessionStatus;
  progress: {
    currentStep: string;
    totalSteps: number;
    currentStepIndex: number;
    percentComplete: number;
  };
  reviewPackReady: boolean;
  errors: ApiCoordinatorError[];
  startedAt: string;
  endedAt: string | null;
}
```

---

## Type Definitions

### Control Panel Types (`src/control-panel/types.ts`)

```typescript
// Session input from user
interface SessionInput {
  email: string;
  householdId: string;
  orderCount: number;
  mergeStrategy: 'latest' | 'combined';
}

// Progress update for UI
interface ProgressUpdate {
  phase: string;
  message: string;
  percentComplete: number;
  isComplete: boolean;
  isError: boolean;
}

// User decision on Review Pack
type UserDecision = 'approve' | 'reject' | 'cancel';

// Renderer interface (for CLI/Web abstraction)
interface Renderer {
  showProgress(update: ProgressUpdate): void;
  showReviewPack(pack: FormattedReviewPack): void;
  showError(error: string): void;
  showSuccess(message: string): void;
  promptDecision(): Promise<UserDecision>;
}

// Formatted Review Pack for display
interface FormattedReviewPack {
  header: HeaderSection;
  summary: SummarySection;
  changes: ChangesSection;
  warnings: WarningSection;
  substitutions?: SubstitutionSection;  // Phase 2
  pruning?: PruningSection;             // Phase 2
  slots?: SlotsSection;                 // Phase 2
}
```

---

## Implementation Plan

### Phase 2a: Core CLI (Week 1)

**Goal:** Minimal working CLI that can start a session and display results.

**Tasks:**
1. Create `src/control-panel/types.ts` with core types
2. Create `src/control-panel/renderer.ts` with Renderer interface
3. Create `src/control-panel/cli-renderer.ts` with terminal output
4. Create `src/control-panel/review-pack-formatter.ts` for ReviewPack -> display
5. Create `src/control-panel/session-manager.ts` for session lifecycle
6. Create `src/control-panel/cli.ts` as main entry point

**Success Criteria:**
- Can start a session from terminal
- Shows progress updates during execution
- Displays formatted Review Pack
- Accepts user decision (approve/reject/cancel)

### Phase 2b: Polish (Week 2)

**Goal:** Improve UX and add error handling.

**Tasks:**
1. Add progress bar visualization
2. Add color coding for warnings/errors
3. Add retry flow for failures
4. Add session history listing
5. Add configuration file support

**Success Criteria:**
- Clear visual feedback during execution
- Graceful error handling with retry options
- Can resume/view previous sessions

### Phase 3: Web UI (Future)

**Goal:** Add web-based interface for non-technical users.

**Tasks:**
1. Create React frontend
2. Implement WebRenderer
3. Add real-time updates via WebSocket
4. Add visual cart comparison

---

## Module Map

| File | Responsibility | Dependencies |
|------|----------------|--------------|
| `types.ts` | Core type definitions | - |
| `renderer.ts` | Renderer interface | `types.ts` |
| `cli-renderer.ts` | Terminal output implementation | `renderer.ts`, chalk |
| `review-pack-formatter.ts` | ReviewPack transformation | `types.ts`, coordinator types |
| `session-manager.ts` | Session lifecycle orchestration | `coordinator-api.ts` |
| `cli.ts` | CLI entry point | all above |

---

## Interface Specifications

### SessionManager -> Renderer

```typescript
interface SessionManager {
  // Start new session, calls renderer.showProgress() during execution
  startSession(input: SessionInput, renderer: Renderer): Promise<SessionResult>;

  // Get current session status
  getStatus(sessionId: string): Promise<SessionStatus>;

  // Submit user decision
  submitDecision(sessionId: string, decision: UserDecision): Promise<void>;
}
```

### ReviewPackFormatter -> FormattedReviewPack

```typescript
interface ReviewPackFormatter {
  // Transform API ReviewPack to display format
  format(reviewPack: ReviewPack): FormattedReviewPack;

  // Format individual sections
  formatHeader(pack: ReviewPack): HeaderSection;
  formatSummary(pack: ReviewPack): SummarySection;
  formatChanges(pack: ReviewPack): ChangesSection;
  formatWarnings(pack: ReviewPack): WarningSection;
}
```

### CLIRenderer -> Terminal

```typescript
interface CLIRenderer extends Renderer {
  // Clear screen and show header
  showHeader(sessionId: string): void;

  // Show progress with spinner/bar
  showProgress(update: ProgressUpdate): void;

  // Show formatted Review Pack
  showReviewPack(pack: FormattedReviewPack): void;

  // Show error with context
  showError(error: string, context?: string): void;

  // Show success message
  showSuccess(message: string): void;

  // Prompt for user decision
  promptDecision(): Promise<UserDecision>;
}
```

---

## Dependencies

### Runtime Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `chalk` | Terminal colors | ^5.0.0 |
| `ora` | Spinner/progress indicator | ^7.0.0 |
| `inquirer` | CLI prompts | ^9.0.0 |
| `cli-table3` | Table formatting | ^0.6.0 |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `@types/inquirer` | TypeScript definitions |

---

## Error Handling

### User-Facing Errors

| Error | Display | Recovery |
|-------|---------|----------|
| Authentication failed | "Login failed. Check credentials." | Retry with new credentials |
| Session timeout | "Session timed out after 5 minutes." | Retry |
| Network error | "Connection lost. Retrying..." | Auto-retry with backoff |
| Cart building failed | "Could not load cart. See details." | Show partial results, retry |

### Error Display Format

```
================================================================================
                                    ERROR
================================================================================

[X] Session Failed: Cart building timed out

Details:
  - Phase: loading_cart
  - Duration: 302 seconds
  - Last step: Loading order ORD-002

Possible causes:
  - Slow network connection
  - Auchan.pt is experiencing issues
  - Session expired

Options:
  [R] Retry session
  [C] Cancel and exit

Enter choice (R/C): _
```

---

## Testing Strategy

### Unit Tests

- `review-pack-formatter.test.ts`: Verify formatting logic
- `cli-renderer.test.ts`: Verify terminal output
- `session-manager.test.ts`: Verify API interaction (mocked)

### Integration Tests

- Full CLI flow with mocked Coordinator
- Error handling scenarios
- Timeout handling

### E2E Tests

- Real session with test credentials (manual)

---

## Related Modules

- [Coordinator](./coordinator.md) - Session orchestration
- [CartBuilder](./cart-builder.md) - Cart population
- Substitution (Phase 2) - Item substitution
- StockPruner (Phase 2) - Stock pruning
- SlotScout (Phase 2) - Delivery slots

---

*Last Updated: 2026-01-11*
