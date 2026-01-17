# Extension Module

**Purpose**: Chrome Extension implementation of AI Shopping Copilot for Auchan.pt
**Status**: MVP Implementation Complete (Sprint-EXT-I-001)

## What This Does

The extension replaces Playwright-based browser automation with a native Chrome Extension approach. It runs entirely in the browser without a backend server, making direct API calls to Anthropic Claude from the service worker.

## Hexagonal Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                             │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      ADAPTERS (Chrome-Specific)              │   │
│  │   StorageAdapter  MessagingAdapter  TabsAdapter  LLMAdapter  │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                      │
│  ┌────────────────────────────┼────────────────────────────────┐   │
│  │                      PORTS (Interfaces)                      │   │
│  │   IStoragePort  IMessagingPort  ITabsPort  ILLMPort          │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                      │
│  ┌────────────────────────────┼────────────────────────────────┐   │
│  │                      CORE (Pure Logic)                       │   │
│  │                                                               │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │   │
│  │   │Orchestrator │  │ Cart Logic  │  │ Substitution│         │   │
│  │   │(State Mach.)│  │ (Diff/Merge)│  │  (Scoring)  │         │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘         │   │
│  │                                                               │   │
│  │   ┌─────────────┐  ┌─────────────┐                           │   │
│  │   │ Slot Logic  │  │   Shared    │                           │   │
│  │   │  (Scoring)  │  │  Utilities  │                           │   │
│  │   └─────────────┘  └─────────────┘                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle**: Core has ZERO Chrome API imports. All platform access via ports.

## Key Files

| File | Role |
|------|------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `src/core/` | Pure business logic (testable without Chrome) |
| `src/ports/` | Interface definitions for adapters |
| `src/adapters/` | Chrome-specific implementations |
| `src/types/` | Shared type definitions |
| `src/entry/` | Extension entry points |

## State Machine

Run orchestration follows: `idle` → `running` → `paused/review` → `complete`

Within `running`: `initializing` → `cart` → `substitution` → `slots` → `finalizing`

See `docs/state-machine.md` for full diagram and transitions.

## Message Protocol

All component communication uses typed messages:
- `MessageAction` enum defines all actions
- Request/response types for each action
- Error handling with `ErrorCode` enum

See `src/types/messages.ts` for full protocol.

## Storage Strategy

| Data | Storage | Reason |
|------|---------|--------|
| API Key | `session` | Cleared on browser close |
| Run state | `session` | Ephemeral, recovery on restart |
| Preferences | `sync` | Persists across devices |
| Order cache | `local` | Large data, 24h TTL |

## Safety Constraints

**CRITICAL**: The extension MUST NEVER place orders automatically.

- No checkout/payment states in state machine
- `review` state is terminal for automation
- User completes purchase manually in browser

## Patterns

- **Dependency Injection**: Core receives adapters via factory
- **State Persistence**: Every state change persists to storage
- **Graceful Degradation**: LLM failures fall back to heuristics
- **Recovery**: Service worker restart resumes from checkpoint

## Gotchas

1. **Service worker restarts**: Reload state from `chrome.storage.session` on wake
2. **No password storage**: User logs in manually; extension detects
3. **Content script isolation**: Cannot access page JS, only DOM
4. **Manifest V3**: Use service workers, not background pages
5. **Message action constants**: Never hardcode action strings. Import from `src/types/messages.ts`:
   ```typescript
   // CORRECT: Import from messages.ts
   import type { MessageAction } from '../src/types/messages.js';
   const ACTIONS = {
     GET_STATE: 'state.get' as const satisfies MessageAction,
   };

   // WRONG: Hardcoded strings cause mismatches
   await chrome.runtime.sendMessage({ action: 'getState' }); // INVALID_REQUEST error
   ```

## Autonomous Debug Logging

All extension components log to a centralized debug server that writes to `extension/logs/debug.log`. This enables Claude Code to autonomously debug issues.

### Setup

```bash
# Terminal 1: Start debug server
cd extension
npm run logs

# Terminal 2: Build and watch
npm run build:watch
```

### Log File Location

Logs written to: `extension/logs/debug.log`

To tail logs:
```bash
tail -f extension/logs/debug.log
```

### Logger Usage

All components must use the centralized logger from `src/utils/logger.ts`:

```typescript
import { logger } from '../utils/logger.js';

logger.info('ComponentName', 'Action description', { contextData });
logger.warn('ComponentName', 'Warning message', { details });
logger.error('ComponentName', 'Error description', error);
```

**Components using logger:**
- Service Worker (`SW`)
- Content Script (`ContentScript`)
- Popup (`Popup`)

### How It Works

1. Logger POSTs JSON to `http://localhost:9222/log`
2. Debug server (scripts/debug-server.mjs) writes to `logs/debug.log`
3. Fallback: Also stores in `chrome.storage.local` if server unavailable
4. Log rotation at 1MB

### Debug Server Endpoints

- `POST /log` - Single log entry
- `POST /logs` - Batch log entries
- `GET /health` - Health check

## Documentation

| Document | Contents |
|----------|----------|
| `docs/architecture.md` | Hexagonal architecture, directory structure |
| `docs/state-machine.md` | State machine diagrams and transitions |
| `docs/migration-plan.md` | Agent migration from Playwright |
| `docs/error-handling.md` | Error classification and recovery |
| `docs/decisions.md` | Architecture Decision Records (ADRs) |

## Development

```bash
# Type check
npm run build:extension

# Unit tests (core logic)
npm run test:extension

# Load unpacked in Chrome
1. chrome://extensions/
2. Enable Developer mode
3. Load unpacked → select extension/ folder
```

## Implementation Summary (Sprint-EXT-I-001)

All MVP components implemented:
- **5 Chrome adapters**: Storage, Messaging, Tabs, Alarms, LLM
- **5 Fake adapters**: For unit testing without Chrome APIs
- **4 Content script extractors**: Login, Order History, Cart, Delivery Slots
- **State machine**: With transitions, guards, and persistence
- **Run orchestrator**: Phases: initializing → cart → substitution → slots → finalizing
- **Entry points**: Service worker and content script

**Files**: 49 TypeScript files, ~13,500 lines of code

## Next Steps

1. Create `manifest.json` for Chrome Extension
2. Bundle with esbuild/vite
3. Test in Chrome browser
4. Add popup UI (Sprint-EXT-I-002)

---

*MVP Implementation: Sprint-EXT-I-001 (2026-01-16)*
*Architecture: Sprint-EXT-A-001 (2026-01-16)*
*Research: Sprint-EXT-R-001 (2026-01-16)*
