# Safety Boundaries

This document describes the safety constraints, boundaries, and guardrails built into the AI Shopping Copilot. These are fundamental design decisions that cannot be overridden.

## Core Safety Principle

**The system NEVER places orders automatically.** The human user always has final approval before any purchase is made.

## NEVER Auto-Purchase Constraint

### Implementation

The Coordinator enforces this at the code level:

```typescript
// coordinator.ts - SAFETY CONSTRAINT comment
/**
 * SAFETY CONSTRAINT: Coordinator NEVER submits orders - stops at review stage.
 */
export class Coordinator {
  async run(context: AgentContext, ...): Promise<CoordinatorResult> {
    // ...session flow...

    // Final state is ALWAYS 'review_ready'
    // There is NO 'order_placed' state
    this.updateStatus('review_ready');

    return {
      success: true,
      data: {
        status: 'review_ready',  // Never 'ordered'
        reviewPack,  // User must review this
      },
    };
  }
}
```

### State Machine

The Coordinator follows a strict state machine:

```
Session States:

  initializing
       |
       v
  authenticating
       |
       v
  loading_cart
       |
       v
  generating_review
       |
       v
  review_ready  <-- TERMINAL STATE (success)
       |
       +---> (User reviews in Control Panel)
       |
       +---> User clicks "Place Order" manually
```

There is no automation beyond `review_ready`. The user must:
1. Review the cart in the Control Panel UI
2. Make any manual adjustments
3. Navigate to Auchan.pt checkout themselves
4. Click "Place Order" on the Auchan website

### What Automation Does NOT Do

| Action | Automated? | Reason |
|--------|------------|--------|
| Login to Auchan.pt | Yes | Required for cart access |
| Load order history | Yes | Required for cart building |
| Add items to cart | Yes | Core functionality |
| Remove items from cart | Yes | Pruning suggestions |
| Navigate to checkout | NO | Safety boundary |
| Enter payment info | NO | Safety boundary |
| Click "Place Order" | NO | Safety boundary |
| Confirm order | NO | Safety boundary |

## Review Pack Approval Requirement

### What Is the Review Pack?

The Review Pack is a summary document that the user MUST review before any order can be placed. It contains:

```typescript
interface ReviewPack {
  sessionId: string;
  generatedAt: Date;

  cart: {
    summary: {
      itemCount: number;
      totalPrice: number;
    };
    diff: {
      added: ReviewDiffItem[];
      removed: ReviewDiffItem[];
      quantityChanged: ReviewQuantityChange[];
    };
    before: ReviewCartItem[];
    after: ReviewCartItem[];
  };

  warnings: ReviewWarning[];
  confidence: ReviewConfidence;

  // Phase 2 additions
  substitutions?: SubstitutionSection;
  pruning?: PruningSection;
  slots?: SlotSection;
}
```

### Explicit Review Items

The Review Pack clearly shows:

1. **Items Added** - What was added and why
2. **Items Removed** - What was removed and why
3. **Quantity Changes** - Previous vs. new quantities
4. **Substitutions** - Original item, proposed substitute, and reason
5. **Unavailable Items** - Out-of-stock items without substitutes
6. **Warnings** - Price changes, data quality issues

### User Actions

Users can take these actions on the Review Pack:

```typescript
enum UserActionType {
  'review_item',        // Inspect a specific item
  'approve_cart',       // Approve and proceed (still requires manual order)
  'reject_cart',        // Start over
  'remove_item',        // Remove an item
  'modify_quantity',    // Change quantity
  'request_substitution', // Find substitute for an item
}
```

Even "approve_cart" does NOT place an order - it only signals readiness for the user to proceed to manual checkout.

## Session State Machine

### Valid State Transitions

```
                                    +-------------+
                                    | CANCELLED   |
                                    +-------------+
                                          ^
                                          | (error at any state)
                                          |
+---------------+    +-----------------+  |  +---------------+
| initializing  | -> | authenticating  | -+->| loading_cart  |
+---------------+    +-----------------+     +-------+-------+
                                                     |
                                                     v
+---------------+    +-----------------+     +---------------+
| review_ready  | <- | generating_     | <-- | (cart loaded) |
|  (terminal)   |    | review          |     |               |
+---------------+    +-----------------+     +---------------+
        |
        v
+---------------+
|  completed    |  <-- User manually approved and ordered
+---------------+
```

### Invalid Transitions (Prevented)

- Cannot skip from `initializing` to `review_ready`
- Cannot go from `review_ready` back to `loading_cart`
- Cannot add a state for "order_placed"

### State Persistence

Sessions can be interrupted and resumed:

```typescript
// Session is saved at each state transition
async function saveSession(session: CoordinatorSession) {
  const filepath = `sessions/${session.sessionId}.json`;
  await writeFile(filepath, JSON.stringify(session));
}

// Recovery loads last known state
async function recoverSession(sessionId: string): Promise<CoordinatorSession> {
  const filepath = `sessions/${sessionId}.json`;
  return JSON.parse(await readFile(filepath));
}
```

## Error Handling Boundaries

### Error Classification

Errors are classified by recoverability:

```typescript
// RECOVERABLE - Can retry
class NetworkError extends CopilotError {
  readonly recoverable = true;
  readonly code = 'NETWORK_ERROR';
}

class TimeoutError extends CopilotError {
  readonly recoverable = true;
  readonly code = 'TIMEOUT_ERROR';
}

// NON-RECOVERABLE - Cannot retry, need user intervention
class SelectorError extends CopilotError {
  readonly recoverable = false;
  readonly code = 'SELECTOR_ERROR';
}

class AuthError extends CopilotError {
  readonly recoverable = false;
  readonly code = 'AUTH_ERROR';
}

class ValidationError extends CopilotError {
  readonly recoverable = false;
  readonly code = 'VALIDATION_ERROR';
}
```

### Retry Boundaries

| Error Type | Max Retries | Delay Pattern |
|------------|-------------|---------------|
| NetworkError | 3 | Exponential backoff |
| TimeoutError | 3 | Exponential backoff |
| SelectorError | 0 | No retry |
| AuthError | 0 | No retry |
| ValidationError | 0 | No retry |

### Escalation Path

```
Error occurs
     |
     v
Is recoverable?
     |
     +--YES--> Retry with backoff
     |              |
     |              v
     |         Success? --> Continue
     |              |
     |              +--NO (retries exhausted)
     |                        |
     +--NO--------------------+
                              |
                              v
                      Log error details
                              |
                              v
                      Capture screenshot
                              |
                              v
                      Set session to 'cancelled'
                              |
                              v
                      Notify user with error context
```

### Worker Failure Isolation

Phase 2 workers (Substitution, StockPruner, SlotScout) are non-blocking:

```typescript
// If Substitution fails, session continues
let substitutionResult = null;
try {
  substitutionResult = await this.delegateToSubstitution(context, items);
} catch (error) {
  logger.warn('Substitution failed (non-blocking)', { error });
  // Session continues - substitution section will be empty
}

// Cart building failure IS blocking - can't proceed without cart
const cartResult = await this.delegateToCartBuilder(context);
if (!cartResult.success) {
  throw new Error('CartBuilder failed - cannot proceed');
}
```

## Data Privacy Considerations

### What Is Stored Locally

- Session state (cart contents, decisions)
- Purchase history (products, dates, quantities)
- Learned preferences (cadences, brand preferences)
- User overrides (custom rules)
- Feedback (approval/rejection of suggestions)

### What Is NOT Stored

- **Passwords** - Only passed in memory, never persisted
- **Payment information** - Never accessed by the system
- **Delivery addresses** - Not extracted or stored
- **Personal identification** - Not collected

### Credential Handling

```typescript
// Credentials are loaded fresh each time, never cached
export function loadCredentials(): AuchanCredentials {
  const email = process.env.AUCHAN_EMAIL;
  const password = process.env.AUCHAN_PASSWORD;

  // Validation only - no storage
  if (!email || !password) {
    throw new Error('Credentials not configured');
  }

  // Return object is used immediately and discarded
  return { email, password };
}

// NEVER log credentials
export function getLoggableConfig(config: AppConfig): Record<string, unknown> {
  const loggable = { ...config };
  // No credentials in config by design
  return loggable;
}
```

### Session Storage Security

Browser sessions are stored locally but contain no sensitive data:

```typescript
// Session storage location
const SESSION_PATH = './sessions/auchan-session.json';

// Contains only:
// - Cookies (auth tokens, not credentials)
// - Local storage data
// - Session state

// Does NOT contain:
// - Passwords
// - Payment info
// - Credit card data
```

### Data Location

All data remains on the user's machine:

```
User's Machine
├── data/              # All persistent data
│   ├── households/    # Preferences, history
│   └── sessions/      # Browser sessions
├── logs/              # Application logs
└── screenshots/       # Debug images

NO external servers
NO cloud sync
NO telemetry
```

## Trust Boundaries

### Trusted Components

| Component | Trust Level | Reason |
|-----------|-------------|--------|
| Coordinator | High | Core orchestration, enforces safety |
| CartBuilder | Medium | Modifies cart within bounds |
| Substitution | Medium | Suggests but doesn't apply |
| StockPruner | Medium | Suggests but doesn't apply |
| SlotScout | Low | Read-only slot discovery |

### Untrusted Input

| Input | Validation |
|-------|------------|
| User credentials | Format validation only |
| Cart data from website | Schema validation |
| Product information | Schema validation |
| Session storage | Integrity check on load |
| Configuration files | Zod schema validation |

### Boundary Enforcement

```typescript
// All external data is validated before use
const CartItemSchema = z.object({
  productId: z.string(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

function loadCartItem(rawData: unknown): CartItem {
  const result = CartItemSchema.safeParse(rawData);
  if (!result.success) {
    throw new ValidationError('Invalid cart item data');
  }
  return result.data;
}
```

## Guardrails Summary

### Hard Limits (Cannot Be Changed)

1. **No automatic ordering** - User must manually place orders
2. **No payment handling** - System never touches payment
3. **No credential storage** - Passwords only in memory
4. **Review Pack required** - Every session produces review

### Soft Limits (Configurable)

1. Session timeout (default: 5 minutes)
2. Max retry attempts (default: 2)
3. Worker enable/disable flags
4. Logging verbosity

### Monitoring Points

```typescript
// Key safety events to monitor
const SAFETY_EVENTS = [
  'session_started',        // Track all sessions
  'login_success',          // Auth completed
  'login_failed',           // Auth issues
  'cart_modified',          // Cart changes
  'review_pack_generated',  // Session completed safely
  'session_cancelled',      // Error or user cancel
  'error_encountered',      // Any error for audit
];
```

## Incident Response

### If Something Goes Wrong

1. **Session auto-cancels** on unrecoverable error
2. **Screenshot captured** at point of failure
3. **Error logged** with full context
4. **User notified** with error description
5. **No partial actions** - cart is left in known state

### Recovery Options

```bash
# View session logs
cat logs/session-*.log

# Check screenshots for visual context
ls screenshots/

# Verify cart state on Auchan.pt
# (Manual verification - open browser and check)

# Clear and restart
rm -rf sessions/
npm run demo
```
