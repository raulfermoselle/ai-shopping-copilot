# Sprint Plan: Extension Module Architecture

**Sprint ID**: Sprint-EXT-A-001
**Module**: Extension (Chrome Extension for Auchan.pt automation)
**Type**: Architecture
**Branch**: feat/chrome-extension
**Status**: ACTIVE
**Created**: 2026-01-16
**Target Completion**: 2026-01-23

---

## Sprint Goals

Design the Chrome Extension architecture with hexagonal separation of concerns, enabling:

1. **Hexagonal architecture design** - Separate pure business logic (testable with Vitest) from Chrome-specific adapters
2. **Adapter interface definitions** - TypeScript interfaces for Chrome APIs (storage, messaging, tabs)
3. **Run orchestration state machine** - Design states (idle → running → paused → review → complete) with transitions and guards
4. **Message protocol specification** - Define protocol between service worker ↔ content scripts ↔ popup
5. **Agent migration strategy** - Determine which agents move to extension vs stay as shared library
6. **Error handling patterns** - Design recovery strategies for service worker lifecycle events

---

## Deliverables

| Deliverable | Output | Location |
|-------------|--------|----------|
| Architecture diagram | Core vs adapter layers visualization | `extension/docs/architecture.md` |
| Adapter interfaces | IStorageAdapter, IMessagingAdapter, ITabsAdapter | `extension/src/adapters/types.ts` |
| State machine diagram | Transitions, guards, recovery | `extension/docs/state-machine.md` |
| Message protocol | MessageAction enum, request/response types | `extension/src/types/messages.ts` |
| Migration plan | Agent mapping document | `extension/docs/migration-plan.md` |
| Error strategy | Classification and recovery patterns | `extension/docs/error-handling.md` |

---

## Constraints

1. **Testability** - Core logic must be testable without Chrome APIs (dependency injection)
2. **Safety** - Must preserve "never auto-purchase" safety constraint
3. **Resilience** - Service worker termination must not lose critical state
4. **Stateless content scripts** - All state in service worker, content scripts are pure DOM accessors

---

## Tasks

### T001: Hexagonal Architecture Design
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design the hexagonal (ports and adapters) architecture separating pure business logic from Chrome-specific code

**Deliverables**:
- Architecture diagram showing core domain, ports (interfaces), and adapters
- Directory structure for `extension/src/core/` (pure business logic) and `extension/src/adapters/` (Chrome-specific)
- Dependency injection strategy for runtime vs test environments
- Build configuration for shared library bundling

**Acceptance Criteria**:
- [ ] ASCII or Mermaid diagram showing core/adapter separation
- [ ] Core modules have zero Chrome API imports
- [ ] Adapters implement interfaces defined in ports
- [ ] Test harness can substitute fake adapters

### T002: Chrome API Adapter Interfaces
**Status**: PENDING
**Owner**: Claude Code
**Description**: Define TypeScript interfaces for Chrome API adapters

**Deliverables**:
- `IStorageAdapter` - abstract chrome.storage operations
- `IMessagingAdapter` - abstract chrome.runtime messaging
- `ITabsAdapter` - abstract chrome.tabs operations
- `IAlarmsAdapter` - abstract chrome.alarms for keep-alive
- Factory pattern for adapter instantiation

**Acceptance Criteria**:
- [ ] All interfaces defined with full type safety
- [ ] Fake implementations for testing created
- [ ] Chrome implementations pass type checking
- [ ] No `any` types in interfaces

### T003: Run Orchestration State Machine
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design the state machine for shopping run orchestration

**States**:
- `idle` - No run active, waiting for user to start
- `running` - Active run with phase (cart, substitution, slots)
- `paused` - Run paused due to error or user action
- `review` - Cart prepared, awaiting user approval
- `complete` - Run finished, results saved

**Deliverables**:
- State machine diagram with all transitions
- Guard conditions for each transition
- Phase sub-states within `running` (cart → substitution → slots)
- Recovery transitions from service worker restart

**Acceptance Criteria**:
- [ ] All states and transitions documented
- [ ] Guards prevent invalid state transitions
- [ ] Service worker restart recovery path defined
- [ ] State machine can be implemented with XState or simple reducer

### T004: Message Protocol Specification
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design the message passing protocol between extension components

**Components**:
- Service Worker (orchestration, API calls, state)
- Content Scripts (DOM extraction, page interaction)
- Popup (user controls, status display)
- Side Panel (future: review pack display)

**Deliverables**:
- `MessageAction` enum with all action types
- Request/response type definitions
- Error response format
- Timeout and retry semantics
- Port-based vs one-shot message decision

**Acceptance Criteria**:
- [ ] All message actions enumerated
- [ ] Request/response types match 1:1
- [ ] Error handling is consistent
- [ ] Service worker lifetime handled gracefully

### T005: Agent Migration Strategy
**Status**: PENDING
**Owner**: Claude Code
**Description**: Plan which agents move to extension vs remain as shared library

**Current Agents**:
- CartBuilder - loads/merges orders
- Substitution - finds replacements
- StockPruner - removes unlikely items
- SlotScout - finds delivery slots
- Coordinator - orchestrates run

**Deliverables**:
- Migration matrix: agent → extension component mapping
- Shared library extraction plan (pure logic)
- Extension-specific adaptation requirements
- Phase-by-phase migration roadmap

**Acceptance Criteria**:
- [ ] Each agent mapped to extension component
- [ ] Shared code identified and extracted
- [ ] No duplicate logic between extension and original
- [ ] Migration preserves all functionality

### T006: Error Handling & Recovery Patterns
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design error classification and recovery strategies for extension context

**Error Categories**:
- Network errors (API calls, site navigation)
- DOM errors (selectors not found, page changed)
- State errors (invalid transition, data corruption)
- Chrome API errors (storage quota, permissions)
- Service worker lifecycle errors (termination, restart)

**Deliverables**:
- Error classification hierarchy (ErrorType enum)
- Recovery strategy for each category
- User notification patterns
- Logging and debugging strategy
- Graceful degradation when LLM unavailable

**Acceptance Criteria**:
- [ ] All error types classified
- [ ] Recovery procedures documented
- [ ] User sees helpful error messages
- [ ] Debug logging captures sufficient context

### T007: Architecture Documentation Assembly
**Status**: PENDING
**Owner**: Claude Code
**Description**: Compile all architecture decisions into final documentation

**Deliverables**:
- Update `extension/CLAUDE.md` with architecture overview
- Create `extension/docs/architecture.md` with diagrams
- Create `extension/docs/decisions.md` with ADRs
- Create `extension/docs/state-machine.md` with state diagram
- Create `extension/docs/migration-plan.md` with agent mapping
- Create `extension/docs/error-handling.md` with recovery patterns

**Acceptance Criteria**:
- [ ] All documentation complete and consistent
- [ ] Cross-references between documents work
- [ ] No forward references to unimplemented features
- [ ] Documentation review ready

---

## Dependencies

**Prerequisites (from Sprint-EXT-R-001)**:
- `docs/extension/architecture-research.md` - Chrome Extension fundamentals
- `docs/extension/migration-mapping.md` - Playwright → Extension tool mapping
- `docs/extension/session-persistence.md` - Storage strategy
- `docs/extension/security-constraints.md` - Safety requirements
- `extension/` prototype skeleton for validation

**Internal**:
- Existing agent code in `src/agents/` for migration reference
- Selector Registry system in `src/selectors/`
- LLM integration in `src/llm/`

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Service worker termination complexity | HIGH | MEDIUM | T003 designs robust state recovery |
| Hexagonal architecture overengineering | MEDIUM | LOW | Keep interfaces minimal, add complexity only when needed |
| Message protocol too complex | MEDIUM | LOW | Start simple, validate with prototype |
| Agent migration scope creep | MEDIUM | MEDIUM | T005 strictly defines boundaries |
| Error handling gaps | HIGH | LOW | T006 systematically covers all categories |

---

## Success Criteria

- [ ] All 7 tasks completed
- [ ] Architecture diagrams clear and implementable
- [ ] TypeScript interfaces compile without errors
- [ ] State machine has no ambiguous transitions
- [ ] Migration plan covers all agents
- [ ] Error handling is comprehensive
- [ ] Ready to hand off to implementation sprint (Sprint-EXT-I-001)

---

## Notes

- This is an **architecture sprint** - no implementation code expected
- Deliverables are documentation and type definitions
- Architecture decisions should enable parallel implementation work
- Prioritize testability - hexagonal pattern ensures core logic is tested without Chrome APIs
- Reference research findings but don't repeat them verbatim

---

*Last Updated: 2026-01-16*
