# Chrome Extension Architecture

**Sprint**: Sprint-EXT-A-001
**Module**: Extension
**Date**: 2026-01-16

---

## 1. Hexagonal Architecture Overview

The extension follows a **hexagonal architecture** (ports and adapters) pattern to separate business logic from Chrome-specific APIs, enabling:

- Unit testing without Chrome runtime
- Easy mocking of external dependencies
- Clear separation of concerns
- Future portability to other platforms

### Architecture Diagram

```
                           ┌─────────────────────────────────────────────────┐
                           │               Chrome Extension                   │
                           │                                                 │
┌──────────────────────┐   │   ┌───────────────────────────────────────┐   │
│    External World    │   │   │              ADAPTERS                  │   │
│                      │   │   │         (Chrome-Specific)              │   │
│  ┌────────────────┐  │   │   │   ┌─────────────┐  ┌─────────────┐   │   │
│  │  Auchan.pt     │◄─┼───┼───┼───│   Tabs      │  │  Storage    │   │   │
│  │  (DOM)         │  │   │   │   │  Adapter    │  │  Adapter    │   │   │
│  └────────────────┘  │   │   │   └──────┬──────┘  └──────┬──────┘   │   │
│                      │   │   │          │                │          │   │
│  ┌────────────────┐  │   │   │   ┌──────┴──────┐  ┌──────┴──────┐   │   │
│  │  Anthropic     │◄─┼───┼───┼───│ Messaging   │  │  Alarms     │   │   │
│  │  API           │  │   │   │   │  Adapter    │  │  Adapter    │   │   │
│  └────────────────┘  │   │   │   └──────┬──────┘  └──────┬──────┘   │   │
│                      │   │   │          │                │          │   │
└──────────────────────┘   │   └──────────┼────────────────┼──────────┘   │
                           │              │                │              │
                           │              ▼                ▼              │
                           │   ┌───────────────────────────────────────┐   │
                           │   │              PORTS                     │   │
                           │   │         (Interfaces)                   │   │
                           │   │                                        │   │
                           │   │   IStoragePort    IMessagingPort       │   │
                           │   │   ITabsPort       IAlarmsPort          │   │
                           │   │   ILLMPort        IDOMExtractorPort    │   │
                           │   │                                        │   │
                           │   └───────────────────┬───────────────────┘   │
                           │                       │                       │
                           │                       ▼                       │
                           │   ┌───────────────────────────────────────┐   │
                           │   │              CORE                      │   │
                           │   │         (Pure Business Logic)          │   │
                           │   │                                        │   │
                           │   │   ┌─────────────────────────────────┐ │   │
                           │   │   │        RunOrchestrator          │ │   │
                           │   │   │   (State Machine + Flow)        │ │   │
                           │   │   └──────────────┬──────────────────┘ │   │
                           │   │                  │                    │   │
                           │   │   ┌──────────────┼──────────────┐     │   │
                           │   │   ▼              ▼              ▼     │   │
                           │   │ ┌────────┐  ┌────────┐  ┌────────┐   │   │
                           │   │ │ Cart   │  │ Subst  │  │ Slots  │   │   │
                           │   │ │ Logic  │  │ Logic  │  │ Logic  │   │   │
                           │   │ └────────┘  └────────┘  └────────┘   │   │
                           │   │                                        │   │
                           │   │   ┌─────────────────────────────────┐ │   │
                           │   │   │      Shared Utilities           │ │   │
                           │   │   │  (Heuristics, Scoring, Zod)     │ │   │
                           │   │   └─────────────────────────────────┘ │   │
                           │   │                                        │   │
                           │   └───────────────────────────────────────┘   │
                           │                                                 │
                           └─────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Chrome APIs | Testable |
|-------|----------------|-------------|----------|
| **Core** | Business logic, state machine, heuristics | None (zero imports) | Yes (Vitest) |
| **Ports** | Interface definitions for external dependencies | None (types only) | N/A |
| **Adapters** | Chrome API implementations of ports | All Chrome APIs | Integration only |

---

## 2. Directory Structure

```
extension/
├── manifest.json                    # Chrome Extension manifest (V3)
├── CLAUDE.md                        # Module documentation
│
├── src/
│   ├── core/                        # Pure business logic (NO Chrome imports)
│   │   ├── orchestrator/
│   │   │   ├── state-machine.ts     # Run state transitions
│   │   │   ├── phases.ts            # Phase definitions (cart, substitution, slots)
│   │   │   └── index.ts
│   │   │
│   │   ├── cart/                    # Cart logic (shared with main project)
│   │   │   ├── diff.ts              # Cart diff algorithms
│   │   │   ├── merge.ts             # Order merge logic
│   │   │   └── index.ts
│   │   │
│   │   ├── substitution/            # Substitution logic (shared)
│   │   │   ├── scoring.ts           # Substitute scoring heuristics
│   │   │   ├── ranking.ts           # Ranking algorithms
│   │   │   └── index.ts
│   │   │
│   │   ├── slots/                   # Slot logic (shared)
│   │   │   ├── scoring.ts           # Slot scoring heuristics
│   │   │   └── index.ts
│   │   │
│   │   └── shared/                  # Shared utilities
│   │       ├── price-utils.ts       # Price parsing, comparison
│   │       ├── date-utils.ts        # Date handling
│   │       └── index.ts
│   │
│   ├── ports/                       # Interface definitions (types only)
│   │   ├── storage.ts               # IStoragePort
│   │   ├── messaging.ts             # IMessagingPort
│   │   ├── tabs.ts                  # ITabsPort
│   │   ├── alarms.ts                # IAlarmsPort
│   │   ├── llm.ts                   # ILLMPort
│   │   └── index.ts
│   │
│   ├── adapters/                    # Chrome-specific implementations
│   │   ├── chrome/
│   │   │   ├── storage-adapter.ts   # chrome.storage implementation
│   │   │   ├── messaging-adapter.ts # chrome.runtime messaging
│   │   │   ├── tabs-adapter.ts      # chrome.tabs operations
│   │   │   ├── alarms-adapter.ts    # chrome.alarms for keep-alive
│   │   │   └── index.ts
│   │   │
│   │   ├── llm/
│   │   │   └── anthropic-adapter.ts # Anthropic API via fetch
│   │   │
│   │   └── fake/                    # Test doubles
│   │       ├── fake-storage.ts      # In-memory storage for tests
│   │       ├── fake-messaging.ts    # Mock messaging for tests
│   │       └── index.ts
│   │
│   ├── types/                       # Shared type definitions
│   │   ├── messages.ts              # Message protocol types
│   │   ├── state.ts                 # Run state types
│   │   ├── cart.ts                  # Cart item types
│   │   ├── orders.ts                # Order types
│   │   └── index.ts
│   │
│   └── entry/                       # Extension entry points
│       ├── service-worker.ts        # Background service worker
│       ├── content-script.ts        # Auchan.pt content script
│       └── popup.ts                 # Popup UI logic
│
├── ui/                              # UI components (HTML/CSS)
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.css
│   └── sidepanel/
│       ├── sidepanel.html
│       └── sidepanel.css
│
├── docs/                            # Architecture documentation
│   ├── architecture.md              # This file
│   ├── state-machine.md             # State machine specification
│   ├── migration-plan.md            # Agent migration strategy
│   ├── error-handling.md            # Error classification & recovery
│   └── decisions.md                 # Architecture Decision Records
│
└── __tests__/                       # Test files
    ├── core/                        # Unit tests for core logic
    │   ├── orchestrator.test.ts
    │   ├── cart.test.ts
    │   └── substitution.test.ts
    └── adapters/                    # Integration tests
        └── chrome-adapters.test.ts
```

---

## 3. Dependency Injection Strategy

### Runtime vs Test Injection

```typescript
// src/core/orchestrator/index.ts
import type { IStoragePort, IMessagingPort } from '../ports';

export interface OrchestratorDependencies {
  storage: IStoragePort;
  messaging: IMessagingPort;
  llm: ILLMPort;
}

export function createOrchestrator(deps: OrchestratorDependencies) {
  // Pure business logic using injected dependencies
  return {
    async startRun() {
      const state = await deps.storage.get('runState');
      // ... business logic
    }
  };
}
```

### Factory Pattern for Adapters

```typescript
// src/adapters/factory.ts
import type { OrchestratorDependencies } from '../core/orchestrator';
import { ChromeStorageAdapter } from './chrome/storage-adapter';
import { ChromeMessagingAdapter } from './chrome/messaging-adapter';
import { AnthropicAdapter } from './llm/anthropic-adapter';

// Production factory (uses real Chrome APIs)
export function createProductionDependencies(): OrchestratorDependencies {
  return {
    storage: new ChromeStorageAdapter(),
    messaging: new ChromeMessagingAdapter(),
    llm: new AnthropicAdapter(),
  };
}

// Test factory (uses fakes)
export function createTestDependencies(): OrchestratorDependencies {
  return {
    storage: new FakeStorageAdapter(),
    messaging: new FakeMessagingAdapter(),
    llm: new FakeLLMAdapter(),
  };
}
```

### Service Worker Initialization

```typescript
// src/entry/service-worker.ts
import { createOrchestrator } from '../core/orchestrator';
import { createProductionDependencies } from '../adapters/factory';

// Create orchestrator with real Chrome adapters
const deps = createProductionDependencies();
const orchestrator = createOrchestrator(deps);

// Register event listeners
chrome.runtime.onInstalled.addListener(() => {
  orchestrator.initialize();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  orchestrator.handleMessage(message, sender, sendResponse);
  return true; // Async response
});
```

---

## 4. Build Configuration

### TypeScript Configuration

```jsonc
// extension/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "paths": {
      "@core/*": ["./src/core/*"],
      "@ports/*": ["./src/ports/*"],
      "@adapters/*": ["./src/adapters/*"],
      "@types/*": ["./src/types/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

### Bundling Strategy

Use **esbuild** or **vite** to bundle:

1. **Service worker bundle**: `service-worker.ts` → `service-worker.js`
2. **Content script bundle**: `content-script.ts` → `content-script.js`
3. **Popup bundle**: `popup.ts` → `popup.js`

Each bundle includes only its dependencies (tree-shaking removes unused code).

---

## 5. Shared Library Extraction

### Reusable from Main Project

These modules can be directly imported or copied:

| Module | Source | Reusable |
|--------|--------|----------|
| Price utilities | `src/utils/` | Direct import |
| Zod schemas | `src/agents/*/types.ts` | Direct import |
| Scoring heuristics | `src/agents/*/scoring.ts` | Adapt (remove Playwright) |
| LLM prompts | `src/llm/prompts/` | Direct import |
| Selector definitions | `data/selectors/` | JSON import |

### Not Reusable (Must Rewrite)

| Module | Reason |
|--------|--------|
| Playwright tools | Browser API specific |
| Session manager | File-based storage |
| Browser tool | Playwright launch |

---

## 6. Testing Strategy

### Unit Tests (Core Layer)

```typescript
// __tests__/core/orchestrator.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createOrchestrator } from '../../src/core/orchestrator';
import { createTestDependencies } from '../../src/adapters/factory';

describe('Orchestrator', () => {
  let orchestrator: ReturnType<typeof createOrchestrator>;
  let deps: ReturnType<typeof createTestDependencies>;

  beforeEach(() => {
    deps = createTestDependencies();
    orchestrator = createOrchestrator(deps);
  });

  it('starts run from idle state', async () => {
    await deps.storage.set('runState', { status: 'idle' });

    await orchestrator.startRun();

    const state = await deps.storage.get('runState');
    expect(state.status).toBe('running');
  });
});
```

### Integration Tests (Adapters)

Use Puppeteer to load extension and test real Chrome API interactions.

---

## 7. Key Design Decisions

### ADR-001: Hexagonal Architecture

**Decision**: Use hexagonal (ports and adapters) pattern.

**Rationale**:
- Enables unit testing without Chrome runtime
- Clear separation between business logic and platform specifics
- Supports future platforms (Firefox, standalone app)

**Consequences**:
- Additional abstraction layer (minimal overhead)
- All Chrome API calls go through adapters

### ADR-002: No Direct Chrome API Imports in Core

**Decision**: Core modules must have zero Chrome API imports.

**Rationale**:
- Ensures testability with Vitest (no Chrome runtime needed)
- Prevents accidental tight coupling
- Clear compile-time enforcement

**Consequences**:
- All external interactions through ports
- Slightly more verbose code

### ADR-003: Fake Adapters for Testing

**Decision**: Provide in-memory fake implementations of all adapters.

**Rationale**:
- Enables fast unit tests (no I/O)
- Deterministic test behavior
- Tests can verify adapter interactions

**Consequences**:
- Must maintain fakes alongside real adapters
- Fakes must match interface contracts exactly

---

*Architecture designed: 2026-01-16*
*Sprint: Sprint-EXT-A-001, Task: T001*
