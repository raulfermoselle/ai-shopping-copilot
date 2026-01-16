# Sprint Plan: Extension Module Research

**Sprint ID**: Sprint-EXT-R-001
**Module**: Extension (Chrome Extension for Auchan.pt automation)
**Type**: Planning & Research
**Branch**: feat/chrome-extension
**Status**: ACTIVE
**Created**: 2026-01-16
**Target Completion**: 2026-01-23

---

## Sprint Goals

Replace Playwright browser automation with a Chrome Extension-based approach:

1. **Research Chrome Extension architecture** - Understand how to implement content scripts, background workers, and popup UI
2. **Design extension structure** - Plan manifest.json, service workers, content script coordination
3. **Map current Playwright tools to extension equivalents** - Identify which tools translate directly vs need redesign
4. **Prototype core patterns** - Implement skeleton for content script injection, DOM monitoring, storage APIs
5. **Document extension-specific challenges** - Session persistence, cross-domain communication, Auchan.pt compatibility

---

## Scope

### In Scope
- Research Chrome Extension APIs (Manifest V3)
- Document architecture for content scripts + background workers + popup
- Map Playwright selectors → content script DOM querying
- Design session persistence with Chrome storage APIs
- Prototype login flow with extension pattern
- Research security model (CSP, origin restrictions)

### Out of Scope
- Implementation of full extension
- UI/UX design for extension popup
- Auchan.pt integration (Phase 2)
- Performance optimization
- Packaging and distribution

---

## Tasks

### T001: Chrome Extension Fundamentals Research
**Status**: PENDING
**Owner**: Claude Code
**Description**: Research Manifest V3, content scripts, background service workers, popup UI patterns

**Deliverables**:
- Summary of Manifest V3 architecture
- Content script lifecycle and messaging
- Background worker capabilities
- Storage API options (sync, local, session)
- Communication patterns between scripts
- **Anthropic API integration from service worker** (CORS, API key storage, request patterns)

**Acceptance Criteria**:
- [x] Document created at `docs/extension-architecture-research.md`
- [x] 3+ examples of content script patterns
- [x] Comparison table: Manifest V2 vs V3
- [x] Identified security constraints

### T002: Auchan.pt Compatibility Analysis
**Status**: PENDING
**Owner**: Claude Code
**Description**: Analyze Auchan.pt for extension compatibility, CSP headers, target pages

**Deliverables**:
- CSP header analysis for target pages (login, search, cart, checkout)
- Identified injection points for content scripts
- Security restrictions analysis
- Workarounds for common restrictions

**Acceptance Criteria**:
- [x] CSP policies documented for each page
- [x] Content script injection strategy defined
- [x] List of blocked/allowed operations
- [x] Alternative approaches documented

### T003: Playwright → Extension Migration Mapping
**Status**: PENDING
**Owner**: Claude Code
**Description**: Map current Playwright tool patterns to extension-based equivalents

**Deliverables**:
- Matrix: Playwright tool → extension approach
- Identified patterns that require redesign
- New tool categories for extension workflow

**Acceptance Criteria**:
- [x] All 15+ current tools mapped
- [x] Migration risks identified
- [x] Fallback strategies documented
- [x] Tool redesign prioritization matrix

### T004: Session Persistence Strategy
**Status**: PENDING
**Owner**: Claude Code
**Description**: Design how to maintain session state with extension architecture

**Deliverables**:
- Storage strategy (sync vs local vs session storage)
- Cookie handling in content scripts
- Service worker lifetime considerations
- Session recovery on extension reload

**Acceptance Criteria**:
- [x] Storage option comparison table
- [x] Session lifecycle diagram
- [x] Cookie synchronization strategy
- [x] Recovery procedure documented

### T005: Prototype Skeleton Implementation
**Status**: PENDING
**Owner**: Claude Code
**Description**: Create minimal working prototype demonstrating core patterns

**Deliverables**:
- Skeleton manifest.json with v3 structure
- Sample content script with DOM query example
- Background service worker skeleton
- Message passing between scripts

**Acceptance Criteria**:
- [x] Manifest loads without errors in Chrome
- [x] Content script logs to console
- [x] Message passing works between background and content
- [x] Storage API basic operations work

### T006: Security & Safety Constraints Documentation
**Status**: PENDING
**Owner**: Claude Code
**Description**: Document extension-specific security constraints and how to maintain safety

**Deliverables**:
- Extension-specific safety constraints vs Playwright
- Authentication flow security considerations
- Data isolation strategy
- Audit trail approach for extension actions

**Acceptance Criteria**:
- [x] Safety constraints documented
- [x] No-order-placement guarantees defined
- [x] Authentication pattern secure against MITM
- [x] User approval mechanism designed

### T007: Sprint Retrospective & Next Steps
**Status**: PENDING
**Owner**: Claude Code
**Description**: Complete sprint with documentation of findings and recommendations

**Deliverables**:
- Sprint completion summary
- Recommended architecture decision
- Phase 2 planning prerequisites
- Risk assessment and mitigation
- **CLAUDE.md for Extension module** (per documentation-system.md requirements)

**Acceptance Criteria**:
- [x] All research compiled in `SPRINT-LOG.md`
- [x] Decision: proceed with extension approach? Any blockers?
- [x] Phase 2 sprint (Sprint-EXT-A-001) plan outlined
- [x] Task breakdown for architecture sprint

---

## Dependencies

**External**:
- Chrome DevTools documentation (publicly available)
- Auchan.pt website access for CSP analysis

**Internal**:
- Selector Registry system (for mapping to extension queries)
- Playwright tools reference (for migration mapping)

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Auchan.pt CSP blocks content script injection | HIGH | MEDIUM | Research workarounds; consider message-passing proxy via popup |
| Service worker lifetime issues | MEDIUM | MEDIUM | Design session recovery; consider port connections |
| Content script DOM access performance | MEDIUM | LOW | Profile; use efficient query patterns from start |
| Extension review process delays | LOW | LOW | Not applicable for internal tool |
| Debugging complexity | MEDIUM | MEDIUM | Establish logging patterns early |

---

## Success Criteria

- [ ] All tasks completed
- [ ] Research documentation comprehensive and accessible
- [ ] Clear decision point: is extension architecture viable?
- [ ] Phase 2 planning can proceed with confidence
- [ ] No critical blockers identified

---

## Notes

- This is a PLANNING sprint to validate extension viability before implementation
- Focus on research quality over speed
- Document all findings thoroughly for Phase 2 team
- If blockers found, escalate and re-evaluate Playwright approach

---

*Last Updated: 2026-01-16*
