# Sprint Plan: Extension Module Architecture

**Sprint ID**: Sprint-EXT-A-001
**Module**: Extension (Chrome Extension for Auchan.pt automation)
**Type**: Architecture
**Branch**: feat/chrome-extension
**Status**: ACTIVE
**Created**: 2026-01-16
**Target Completion**: 2026-01-30

---

## Sprint Goals

Design and establish the Chrome Extension architecture based on research findings from Sprint-EXT-R-001:

1. **Design extension directory structure** - Organize files for manifest, service worker, content scripts, popup UI, styles
2. **Create architecture documentation** - CLAUDE.md, decisions.md, architecture.md for extension module
3. **Design data flow models** - Request/response patterns, state management, message passing between components
4. **Design service worker lifecycle management** - Handle ~30s timeout, session persistence, graceful degradation
5. **Design content script injection strategy** - Page detection, DOM monitoring, error handling for SPA navigation
6. **Design extension-specific tool interfaces** - Adapt Playwright tools to extension message-passing pattern
7. **Create implementation task breakdown** - Detailed tasks for Sprint-EXT-I-001

---

## Scope

### In Scope
- Extension directory structure and file organization
- Architecture documentation (data flow, component interaction)
- Service worker state machine design
- Content script lifecycle and messaging protocol
- Tool interface redesign (Playwright → extension)
- Implementation planning and task breakdown
- Security architecture review

### Out of Scope
- Actual implementation code
- UI/UX detailed design (prototype from research can be refined)
- Performance optimization
- Extension packaging/distribution
- Auchan.pt integration (Phase 2)

---

## Tasks

### T001: Extension Directory Structure Design
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design and establish the folder structure for the extension module

**Deliverables**:
- Directory layout with manifest, service worker, content scripts, popup, styles
- File naming conventions and organization principles
- Configuration file structure (build, env, feature flags)
- Documentation location guidelines

**Acceptance Criteria**:
- [ ] Directory structure rationale documented
- [ ] All folders created with README explaining purpose
- [ ] Build tool configuration prepared (manifest validation, bundling)
- [ ] Team can understand structure at a glance

### T002: Module Documentation (CLAUDE.md + docs/)
**Status**: PENDING
**Owner**: Claude Code
**Description**: Create comprehensive module documentation per documentation-system.md

**Deliverables**:
- `extension/CLAUDE.md` - Module overview, patterns, key concepts
- `extension/docs/architecture.md` - Data flow, component interaction, state machine
- `extension/docs/decisions.md` - ADRs for extension-specific choices
- Cross-references to research documents

**Acceptance Criteria**:
- [ ] CLAUDE.md follows project template (60-80 lines)
- [ ] Architecture document includes component diagrams (ASCII or Mermaid)
- [ ] All design decisions documented with rationale
- [ ] No forward references to unimplemented features

### T003: Service Worker State Machine
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design state machine for service worker lifecycle

**Deliverables**:
- State diagram (states: idle, authenticating, running, session-recovery, error)
- Transition rules and triggers
- Timeout/recovery handling strategy
- API request queuing during service worker sleep

**Acceptance Criteria**:
- [ ] All possible states documented
- [ ] Transitions have clear entry/exit conditions
- [ ] Recovery procedures prevent data loss
- [ ] State diagram can be implemented as code

### T004: Message Protocol Design
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design request/response protocol for content script ↔ service worker communication

**Deliverables**:
- Message format specification (JSON schema)
- Request types catalog (navigate, scan, click, extract, etc.)
- Response types with error handling patterns
- Timeout and retry strategy

**Acceptance Criteria**:
- [ ] Message schema defines all fields and types
- [ ] Request/response types enumerated
- [ ] Error scenarios documented
- [ ] Protocol handles service worker lifetime gracefully

### T005: Tool Interface Redesign
**Status**: PENDING
**Owner**: Claude Code
**Description**: Redesign Playwright tool interfaces for extension message-passing

**Deliverables**:
- Tool interface adaptation patterns (sync → async messaging)
- Migration guide for each tool category (navigation, extraction, interaction)
- New tool signatures for content script context
- Backward compatibility considerations

**Acceptance Criteria**:
- [ ] All 15+ tools mapped to new interface
- [ ] Async patterns documented with examples
- [ ] Error handling strategy defined
- [ ] Type definitions ready for implementation

### T006: Security Architecture Review
**Status**: PENDING
**Owner**: Claude Code
**Description**: Review security architecture for extension-specific threats

**Deliverables**:
- Threat model specific to extension (vs Playwright)
- API key storage security (session storage rationale)
- Content script isolation and context boundaries
- CORS handling for Anthropic API calls
- User approval mechanism design

**Acceptance Criteria**:
- [ ] No critical security gaps identified
- [ ] Authentication flow secure against MITM
- [ ] API key handling prevents leakage
- [ ] Extension maintains no-auto-purchase guarantee

### T007: Implementation Planning & Task Breakdown
**Status**: PENDING
**Owner**: Claude Code
**Description**: Create detailed task breakdown for Sprint-EXT-I-001

**Deliverables**:
- tasks.md with 20-30 implementation tasks
- Task dependencies and execution order
- Acceptance criteria for each task
- Testing strategy outline

**Acceptance Criteria**:
- [ ] All tasks have clear, actionable descriptions
- [ ] Dependencies documented for parallel execution
- [ ] Estimation provided (small/medium/large)
- [ ] tests.md created with test categories

### T008: Architecture Review & Approval
**Status**: PENDING
**Owner**: Claude Code
**Description**: Complete architecture with final review and sign-off

**Deliverables**:
- All architecture documents finalized
- Code review completed (documentation, clarity)
- Risk assessment for Phase 2 implementation
- Approval recommendation for Sprint-EXT-I-001

**Acceptance Criteria**:
- [ ] All tasks completed and linked
- [ ] Documentation review passed
- [ ] No critical issues identified
- [ ] Ready to hand off to implementation sprint

---

## Dependencies

**External**:
- Chrome Extension API documentation
- Anthropic API documentation

**Internal**:
- Sprint-EXT-R-001 research documents (reference)
- Selector Registry system (tool interface patterns)
- Existing Playwright tools (migration mapping)

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Service worker timeout causing state loss | HIGH | MEDIUM | Design robust state persistence with recovery flow |
| Message protocol too complex for implementation | MEDIUM | LOW | Keep protocol simple; review before finalizing |
| Tool redesign incomplete | MEDIUM | MEDIUM | Validate all 15+ tools during T005 |
| Security gaps in API key handling | HIGH | LOW | Security review (T006) prevents issues early |
| Implementation tasks too vague | MEDIUM | MEDIUM | Create detailed acceptance criteria during T007 |

---

## Success Criteria

- [ ] All 8 tasks completed
- [ ] Comprehensive architecture documentation in place
- [ ] Implementation team has clear roadmap
- [ ] No critical blockers identified for Phase 2
- [ ] Code review passed

---

## Notes

- This sprint bridges research (EXT-R-001) and implementation (EXT-I-001)
- Architecture quality directly affects implementation speed
- Documentation should be detailed enough that another developer can implement
- Consider design patterns that minimize debugging complexity (logging, error handling)

---

*Last Updated: 2026-01-16*
