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
