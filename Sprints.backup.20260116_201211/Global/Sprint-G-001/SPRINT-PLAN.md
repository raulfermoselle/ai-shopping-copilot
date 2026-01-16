# Sprint-G-001: Project Scaffolding & Playwright Setup

<!-- SPRINT_STATUS: Completed -->
<!-- CREATED: 2026-01-10 -->
<!-- MODULE: Global -->
<!-- TYPE: Implementation -->

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint ID | Sprint-G-001 |
| Module | Global |
| Type | Implementation |
| Status | Completed |
| Created | 2026-01-10 |
| Dependencies | None (first sprint) |

## Objective

Set up the foundational project structure and Playwright automation framework for the AI Shopping Copilot. This sprint establishes the development environment and creates the tool abstraction layer that all subsequent sprints will build upon.

## Success Criteria

- [x] Monorepo structure with clear module boundaries
- [x] TypeScript configured with strict mode
- [x] Playwright installed and configured for Auchan.pt
- [x] Base tool abstraction layer defined
- [x] Error handling patterns established
- [x] Development scripts (build, test, lint) working

---

## Tasks

### T001: Initialize Project Structure
**Priority**: High | **Estimate**: Foundation task

Create the monorepo structure with proper directories:

```
ai-shopping-copilot/
├── src/
│   ├── agents/           # Agent implementations
│   │   ├── coordinator/
│   │   ├── cart-builder/
│   │   ├── substitution/
│   │   ├── stock-pruner/
│   │   └── slot-scout/
│   ├── tools/            # Playwright tool wrappers
│   ├── memory/           # Memory/persistence layer
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Shared utilities
├── tests/                # Test files
├── config/               # Configuration files
├── scripts/              # Development scripts
└── docs/                 # Technical documentation
```

**Acceptance**:
- Directory structure created
- README.md updated with project structure

---

### T002: Configure TypeScript & Package.json
**Priority**: High | **Estimate**: Foundation task

Set up TypeScript with strict configuration:

- `tsconfig.json` with strict mode, ES2022 target
- Path aliases for clean imports (`@/agents`, `@/tools`, etc.)
- `package.json` with scripts and dependencies

**Dependencies**:
- TypeScript 5.x
- Node.js 20+ (LTS)

**Acceptance**:
- `tsc` compiles without errors
- Path aliases work correctly

---

### T003: Install & Configure Playwright
**Priority**: High | **Estimate**: Foundation task

Set up Playwright for browser automation:

- Install Playwright with Chromium
- Configure for Auchan.pt domain
- Set up browser context with Portuguese locale
- Configure viewport, user agent
- Add screenshot and trace capabilities

**Configuration**:
```typescript
// playwright.config.ts considerations
- baseURL: 'https://www.auchan.pt'
- locale: 'pt-PT'
- viewport: { width: 1280, height: 720 }
- screenshot: 'only-on-failure'
- trace: 'retain-on-failure'
```

**Acceptance**:
- Playwright launches browser successfully
- Can navigate to Auchan.pt homepage
- Screenshots captured on demand

---

### T004: Create Base Tool Abstraction
**Priority**: High | **Estimate**: Core architecture

Define the tool interface that all Playwright tools will implement:

```typescript
interface Tool<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

interface ToolContext {
  page: Page;
  logger: Logger;
  screenshot: (name: string) => Promise<string>;
}

interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: ToolError;
  screenshots?: string[];
}
```

**Acceptance**:
- Tool interface defined and exported
- ToolContext provides necessary Playwright access
- ToolResult handles success/failure uniformly

---

### T005: Implement Error Handling Patterns
**Priority**: Medium | **Estimate**: Foundation task

Establish error handling and retry patterns:

- Custom error classes (NetworkError, SelectorError, TimeoutError)
- Retry decorator with exponential backoff
- Error categorization for 3-strike rule
- Structured logging format

**Error Categories**:
- Recoverable: Network timeouts, temporary UI issues
- Non-recoverable: Login failure, critical selector changes
- Ambiguous: Requires screenshot + human decision

**Acceptance**:
- Error classes defined
- Retry utility implemented
- Logging outputs structured JSON

---

### T006: Create Development Scripts
**Priority**: Medium | **Estimate**: Foundation task

Set up development workflow:

- `npm run build` - TypeScript compilation
- `npm run dev` - Watch mode
- `npm run test` - Run tests
- `npm run lint` - ESLint + Prettier
- `npm run playwright:test` - Playwright tests

**Acceptance**:
- All scripts execute successfully
- ESLint configured with TypeScript rules
- Prettier formatting consistent

---

### T007: Create Initial Configuration System
**Priority**: Medium | **Estimate**: Foundation task

Set up configuration management:

- Environment variables for secrets (credentials)
- Config file for non-sensitive settings
- Validation at startup

**Configuration Items**:
```typescript
interface Config {
  auchan: {
    baseUrl: string;
    timeouts: {
      navigation: number;
      element: number;
    };
  };
  browser: {
    headless: boolean;
    slowMo: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    outputDir: string;
  };
}
```

**Acceptance**:
- Config loads from file + environment
- Missing required values throw clear errors
- Sensitive values not logged

---

## Out of Scope

- Login automation (Sprint-G-002)
- Any Auchan.pt page interactions beyond homepage
- Database/persistence layer (Sprint-G-003)
- Agent implementations

---

## Technical Notes

### Browser Automation Considerations

- Auchan.pt may have bot detection - consider:
  - Realistic user agent
  - Random delays between actions
  - Human-like mouse movements (future)

### TypeScript Path Aliases

```json
// tsconfig.json paths
{
  "paths": {
    "@/agents/*": ["src/agents/*"],
    "@/tools/*": ["src/tools/*"],
    "@/memory/*": ["src/memory/*"],
    "@/types/*": ["src/types/*"],
    "@/utils/*": ["src/utils/*"]
  }
}
```

---

## References

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Problem Statement](../../../problem-statement.md)
- [Solution Architecture](../../../solution-architecture.md)

---

*Sprint Created: 2026-01-10*
