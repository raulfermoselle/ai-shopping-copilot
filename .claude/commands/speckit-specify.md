---
description: Create feature specification with sprint integration
---

# /speckit-specify - Feature Specification

Creates a structured feature specification integrated with Sprint Management.

## Usage

```
/speckit-specify [feature description]
```

## Execution Steps

### 1. Generate Feature Identifiers

```python
# Determine short name (2-4 words, action-noun format)
short_name = extract_keywords(feature_description)

# Find next feature number
existing_specs = glob("Sprints/Specs/*/")
next_number = max([extract_number(s) for s in existing_specs]) + 1
feature_id = f"{next_number:03d}-{short_name}"

# Create branch name
branch = f"feature/{feature_id}"
```

### 2. Create Spec Directory

```bash
mkdir -p Sprints/Specs/{feature_id}/checklists
```

### 3. Generate Specification

Read template: `templates/speckit/spec-template.md`

Parse feature description to extract:
- **Actors**: Who uses this?
- **Actions**: What can they do?
- **Data**: What entities involved?
- **Constraints**: What limits apply?

Write to: `Sprints/Specs/{feature_id}/spec.md`

**Clarification Limits**:
- Maximum 3 `[NEEDS CLARIFICATION]` markers allowed in spec
- Prioritize by impact scope:
  1. **Architectural** (affects multiple components)
  2. **Feature** (affects core functionality)
  3. **UI/UX** (affects presentation only)
- For lower-priority uncertainties: Make informed guess, document assumption
- Mark only true unknowns that block implementation planning

**Success Criteria Requirements**:
Each success criterion must be:
- **Measurable**: Include specific numbers or verifiable outcomes
  - ✅ "User can register in < 3 seconds"
  - ❌ "User registration is fast"
- **Technology-agnostic**: No framework or API specifics
  - ✅ "System sends confirmation email within 1 minute"
  - ❌ "SendGrid delivers confirmation email"
- **User-focused**: Describes user-observable behavior
  - ✅ "User sees error message if email already exists"
  - ❌ "Database unique constraint enforced on email column"
- **Verifiable without implementation**: Can be tested independently
  - ✅ "User can reset password via email link"
  - ❌ "JWT token expires after 24 hours" (implementation detail)

### 4. Sprint Integration

Calculate story points and recommend sprint allocation:

| Total Points | Recommendation |
|--------------|----------------|
| <= 13 | Single sprint |
| 14-26 | 2 sprints |
| 27-40 | 3 sprints |
| > 40 | Epic decomposition |

Update `Sprints/SPRINT-PLANNING.md`:
```markdown
### Backlog

| Feature | Points | Priority | Status |
|---------|--------|----------|--------|
| {feature_id} | {points} | P1 | Spec Ready |
```

### 5. Generate Requirements Checklist

Create `Sprints/Specs/{feature_id}/checklists/requirements.md` from `templates/speckit/checklist-template.md`

### 5.5. Re-Validation Cycle (If Clarifications Provided)

**Trigger**: User provides responses to `[NEEDS CLARIFICATION]` items via `/speckit-clarify`

**Process**:

1. **Update spec.md** with clarification responses
   - Replace `[NEEDS CLARIFICATION: question]` with actual decision
   - Add rationale to relevant sections
   - Update affected User Stories or Functional Requirements

2. **Re-validate against requirements checklist**
   - Read `checklists/requirements.md`
   - Verify all checklist items still pass with new information
   - Update checklist if clarifications revealed new requirements

3. **Check for new clarifications**
   - Scan updated spec for any new unknowns
   - If new `[NEEDS CLARIFICATION]` items emerge: Document and prioritize
   - If no new unknowns: Mark spec as "Ready for Planning"

4. **Iteration limit**
   - Maximum 3 clarification cycles allowed
   - After 3 cycles: Make best-effort decisions, document assumptions
   - Principle: Better to proceed with documented assumptions than infinite loops

**Gate**: Spec must pass checklist validation before proceeding to `/speckit-plan`

### 6. Report

Output:
- Feature ID and branch name
- Spec file path
- Story point estimate
- Sprint allocation recommendation
- Checklist status
- Next command suggestion

---

## Writing Principles

When generating spec.md:

1. **Focus on WHAT/WHY**: User needs, not implementation
2. **Technology-agnostic**: No frameworks or APIs
3. **Testable requirements**: Each must be verifiable
4. **Informed defaults**: Make reasonable assumptions
5. **Mark uncertainties**: Use `[NEEDS CLARIFICATION]` (max 3)

---

## Output Example

```
## Specification Complete

**Feature**: 001-user-authentication
**Branch**: `feature/001-user-authentication`
**Spec**: `Sprints/Specs/001-user-authentication/spec.md`

### User Stories
- US1: User can register with email (P1) - 5 points
- US2: User can login with OAuth2 (P1) - 8 points
- US3: User can reset password (P2) - 3 points

### Sprint Allocation
Recommended: 2 sprints (16 points)
- Sprint N: US1 + US2 (13 points)
- Sprint N+1: US3 + polish (3 points)

### Checklist Status
Requirements: 0/14 complete (pending review)

### Next Steps
1. Review spec.md for accuracy
2. Complete requirements checklist
3. Run `/speckit-clarify 001-user-authentication` if clarifications needed
4. Run `/speckit-plan 001-user-authentication` to create implementation plan
```

---

## Error Handling

| Error | Action |
|-------|--------|
| No description | Prompt for feature description |
| Specs directory missing | Create `Sprints/Specs/` |
| Template missing | Error with template path |

---

## Integration Points

- **Before**: User has feature idea
- **After**: `/speckit-clarify` or `/speckit-plan`
- **Sprint**: Adds to SPRINT-PLANNING.md backlog
