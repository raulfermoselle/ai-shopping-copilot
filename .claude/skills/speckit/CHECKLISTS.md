# Spec-Kit Checklists

Templates for verification checklists at each stage.

## Requirements Checklist Template

```markdown
# Requirements Checklist: {FEATURE_NAME}

**Feature ID**: {FEATURE_ID}
**Date**: {DATE}
**Reviewer**: {REVIEWER}

## Functional Requirements

| ID | Requirement | Implemented | Tested | Verified |
|----|-------------|-------------|--------|----------|
| FR1 | {desc} | [ ] | [ ] | [ ] |
| FR2 | {desc} | [ ] | [ ] | [ ] |

## Non-Functional Requirements

| ID | Requirement | Met | Evidence |
|----|-------------|-----|----------|
| NFR1 | {desc} | [ ] | {how verified} |
| NFR2 | {desc} | [ ] | {evidence} |

## User Stories

### US1: {Title}

| AC | Criterion | Pass | Notes |
|----|-----------|------|-------|
| AC1.1 | {criterion} | [ ] | |
| AC1.2 | {criterion} | [ ] | |

### US2: {Title}

| AC | Criterion | Pass | Notes |
|----|-----------|------|-------|
| AC2.1 | {criterion} | [ ] | |
| AC2.2 | {criterion} | [ ] | |

## Edge Cases

- [ ] Empty input handled
- [ ] Maximum limits tested
- [ ] Error states handled
- [ ] Concurrent access handled (if applicable)

## Summary

- Total Items: {N}
- Passed: {N}
- Failed: {N}
- Status: PASS / FAIL / PARTIAL
```

---

## Design Checklist Template

```markdown
# Design Checklist: {FEATURE_NAME}

**Feature ID**: {FEATURE_ID}
**Date**: {DATE}
**Reviewer**: {REVIEWER}

## Architecture

- [ ] Design follows existing patterns
- [ ] Component boundaries are clear
- [ ] Dependencies are minimized
- [ ] No circular dependencies introduced

## Data Model

- [ ] Entities properly normalized
- [ ] Relationships correctly defined
- [ ] Indexes planned for queries
- [ ] Migration strategy defined

## API Design

- [ ] RESTful conventions followed
- [ ] Consistent naming
- [ ] Proper HTTP methods used
- [ ] Error responses standardized
- [ ] Versioning considered

## Security

- [ ] Authentication required where needed
- [ ] Authorization checks in place
- [ ] Input validation implemented
- [ ] Sensitive data protected
- [ ] No secrets in code

## Performance

- [ ] Database queries optimized
- [ ] Caching strategy defined
- [ ] No N+1 query issues
- [ ] Pagination implemented for lists

## Maintainability

- [ ] Code is self-documenting
- [ ] Complex logic has comments
- [ ] Consistent code style
- [ ] No magic numbers/strings

## Summary

- Total Items: {N}
- Passed: {N}
- Failed: {N}
- Status: PASS / FAIL / PARTIAL
```

---

## Implementation Checklist Template

```markdown
# Implementation Checklist: {FEATURE_NAME}

**Feature ID**: {FEATURE_ID}
**Date**: {DATE}
**Reviewer**: {REVIEWER}

## Code Quality

- [ ] All tests passing
- [ ] No linting errors
- [ ] No type errors
- [ ] Code coverage acceptable (>80%)
- [ ] No console.log/print statements left

## Testing

- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Edge cases tested
- [ ] Error scenarios tested
- [ ] Tests are deterministic (no flakiness)

## Documentation

- [ ] README updated (if needed)
- [ ] API documentation updated
- [ ] Code comments for complex logic
- [ ] CHANGELOG updated

## Git Hygiene

- [ ] Commits are atomic and well-described
- [ ] No merge conflicts
- [ ] Branch is up to date with main
- [ ] No unrelated changes included

## Pre-Deployment

- [ ] Environment variables documented
- [ ] Database migrations tested
- [ ] Rollback plan exists
- [ ] Feature flags configured (if applicable)

## Final Verification

- [ ] Manual testing completed
- [ ] Stakeholder demo done (if required)
- [ ] No known bugs remaining
- [ ] Ready for code review

## Summary

- Total Items: {N}
- Passed: {N}
- Failed: {N}
- Status: PASS / FAIL / PARTIAL
```

---

## Quick Verification Checklist

For smaller features or quick validation:

```markdown
# Quick Checklist: {FEATURE_NAME}

## Must Have
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] No security issues
- [ ] Documentation updated

## Should Have
- [ ] Code reviewed
- [ ] Performance acceptable
- [ ] Error handling complete

## Nice to Have
- [ ] Edge cases handled
- [ ] Logging added
- [ ] Metrics added

Status: READY / NOT READY
```

---

## Checklist Generation Rules

When generating checklists automatically:

1. **Requirements Checklist**
   - One row per FR/NFR from spec.md
   - One section per User Story
   - Include all Acceptance Criteria

2. **Design Checklist**
   - Include all components from plan.md
   - Add security items based on feature type
   - Add performance items for data-heavy features

3. **Implementation Checklist**
   - Standard items always included
   - Additional items based on tech stack
   - Feature-specific items from spec

## Checklist Completion

A feature is ready for release when:
- Requirements Checklist: 100% PASS
- Design Checklist: 100% PASS
- Implementation Checklist: 100% PASS (or documented exceptions)

Exceptions must be:
- Documented in the checklist
- Approved by stakeholder
- Tracked for future resolution
