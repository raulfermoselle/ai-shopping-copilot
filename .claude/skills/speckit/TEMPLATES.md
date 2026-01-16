# Spec-Kit Templates

Templates for specification artifacts.

## spec.md Template

```markdown
# Feature: {FEATURE_NAME}

**ID**: {FEATURE_ID}
**Created**: {DATE}
**Status**: Draft | In Review | Approved
**Author**: {AUTHOR}

## Overview

{Brief description of what this feature does and why it matters}

## User Stories

### US1: {Story Title}
As a {user role}, I want {goal/desire} so that {benefit/value}.

**Acceptance Criteria**:
- [ ] AC1.1: {specific, testable criterion}
- [ ] AC1.2: {specific, testable criterion}

### US2: {Story Title}
As a {user role}, I want {goal/desire} so that {benefit/value}.

**Acceptance Criteria**:
- [ ] AC2.1: {criterion}
- [ ] AC2.2: {criterion}

## Requirements

### Functional Requirements
- **FR1**: {requirement description}
- **FR2**: {requirement description}

### Non-Functional Requirements
- **NFR1**: {performance/security/scalability requirement}
- **NFR2**: {requirement}

## Constraints

- {Technical constraint}
- {Business constraint}

## Out of Scope

The following are explicitly NOT part of this feature:
- {Item 1}
- {Item 2}

## Dependencies

- {External system or feature dependency}

## Open Questions

- [ ] Q1: {Question needing clarification}
- [ ] Q2: {Question}

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | {DATE} | {AUTHOR} | Initial draft |
```

---

## plan.md Template

```markdown
# Implementation Plan: {FEATURE_NAME}

**Feature ID**: {FEATURE_ID}
**Created**: {DATE}
**Status**: Draft | Approved

## Approach Summary

{High-level description of how this will be implemented}

## Architecture

### System Context
{How this feature fits into the overall system}

### Component Design
{Key components and their responsibilities}

## Components

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| {Name} | {service/model/controller/etc} | {purpose} |

### Modified Components

| Component | Changes |
|-----------|---------|
| {Name} | {description of changes} |

## Data Model

### New Entities

**{EntityName}**
- id: UUID
- {field}: {type}
- created_at: DateTime
- updated_at: DateTime

### Modified Entities

**{EntityName}**
- ADD {field}: {type}
- MODIFY {field}: {change}

## API Design

### New Endpoints

**POST /api/v1/{resource}**
- Purpose: {description}
- Request: {schema}
- Response: {schema}

### Modified Endpoints

**{METHOD} {path}**
- Change: {description}

## Security Considerations

- {Authentication/authorization requirements}
- {Data protection measures}

## Performance Considerations

- {Expected load}
- {Caching strategy}
- {Optimization needs}

## Testing Strategy

### Unit Tests
- {Component}: {what to test}

### Integration Tests
- {Flow}: {what to test}

### E2E Tests
- {Scenario}: {what to test}

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| {Risk} | Low/Med/High | Low/Med/High | {strategy} |

## Dependencies

- {External dependency}
- {Internal dependency}

## Milestones

1. {Milestone 1}: {description}
2. {Milestone 2}: {description}
```

---

## tasks.md Template

```markdown
# Tasks: {FEATURE_NAME}

**Feature ID**: {FEATURE_ID}
**Created**: {DATE}
**Total Tasks**: {N}
**Estimated Sprints**: {N}

## Overview

{Brief description of implementation approach}

## Phase 1: Setup

Infrastructure and foundation tasks.

- [ ] T001: {task description}
  - Files: {files to create/modify}
  - Dependencies: None
  
- [ ] T002: {task description}
  - Files: {files}
  - Dependencies: T001

## Phase 2: Core Implementation

### User Story 1: {Title}

- [ ] T003: Write tests for {story} [TEST-FIRST]
  - Files: tests/{test_file}
  - Expected: Tests fail (red phase)
  
- [ ] T004: Implement {story}
  - Files: src/{files}
  - Dependencies: T003
  - Expected: Tests pass (green phase)

### User Story 2: {Title}

- [ ] T005: Write tests for {story} [TEST-FIRST]
  - Files: tests/{test_file}
  - Expected: Tests fail (red phase)
  
- [ ] T006: Implement {story}
  - Files: src/{files}
  - Dependencies: T005
  - Expected: Tests pass (green phase)

## Phase 3: Integration

Cross-cutting and integration tasks.

- [ ] T007: Integration testing
  - Files: tests/integration/{files}
  - Dependencies: T004, T006

- [ ] T008: API documentation
  - Files: docs/{files}
  - Dependencies: T004, T006

## Phase 4: Verification

Final verification tasks.

- [ ] T009: End-to-end testing
  - Dependencies: T007

- [ ] T010: Code review and cleanup
  - Dependencies: All previous

- [ ] T011: Update user documentation
  - Files: docs/{files}

## Task Dependencies

```
T001 --> T002 --> T003 --> T004 --> T007 --> T009 --> T010
                    |               ^
                    v               |
                  T005 --> T006 ----+
                                    |
                                    v
                                  T008 --> T011
```

## Sprint Allocation

### Sprint 1: Foundation (T001-T004)
- Setup and first user story

### Sprint 2: Features (T005-T008)
- Second user story and integration

### Sprint 3: Polish (T009-T011)
- Testing and documentation

## Notes

- {Important implementation note}
- {Technical consideration}
```

---

## Checklist Templates

See CHECKLISTS.md for detailed checklist templates.

---

## Directory Structure

After full pipeline completion:

```
Sprints/Specs/{feature-id}/
├── spec.md              # Feature specification
├── plan.md              # Implementation plan
├── tasks.md             # Task breakdown
├── data-model.md        # Data structures (if needed)
├── api-contract.md      # API definitions (if needed)
├── analysis.md          # Spec analysis results
└── checklists/
    ├── requirements.md  # Requirements checklist
    ├── design.md        # Design checklist
    └── implementation.md # Implementation checklist
```

## Feature ID Convention

Format: `{NNN}-{kebab-case-name}`

Examples:
- 001-user-authentication
- 002-payment-processing
- 003-notification-system

Numbers are sequential within the project.
