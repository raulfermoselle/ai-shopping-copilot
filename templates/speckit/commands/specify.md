---
description: Create a feature specification from a description (Sprint-Speckit Integration)
---

# /speckit.specify - Feature Specification

This command converts a feature description into a structured specification document, integrated with the Sprint Management Framework.

## Usage

```
/speckit.specify [feature description]
```

**Example**:
```
/speckit.specify User authentication with OAuth2 support and session management
```

---

## Workflow

### Step 1: Generate Feature Identifiers

1. Extract 2-4 keyword short name (action-noun format)
2. Check existing specs in `Sprints/Specs/` for highest feature number
3. Increment to get next feature number: `[NNN]`
4. Generate branch name: `feature/[NNN]-[short-name]`

### Step 2: Create Spec Directory

```
Sprints/Specs/[NNN]-[short-name]/
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Requirements validation checklist
└── (other artifacts added by /speckit.plan)
```

### Step 3: Parse Feature Description

Extract from the user's description:
- **Actors**: Who uses this feature?
- **Actions**: What can they do?
- **Data**: What information is involved?
- **Constraints**: Any limitations or requirements?

### Step 4: Generate Specification

Use `templates/speckit/spec-template.md` to create `spec.md`:

1. Populate header with feature branch and date
2. Create user stories from parsed description
3. Define functional requirements
4. Identify key entities
5. Draft success criteria
6. Mark unclear areas with `[NEEDS CLARIFICATION]` (max 3)

### Step 5: Sprint Integration

1. Estimate story points for each user story
2. Calculate total effort
3. Recommend sprint allocation:
   - Single sprint if total <= 70% capacity
   - Multi-sprint by user story priority otherwise
4. Update `Sprints/SPRINT-PLANNING.md` with new feature

### Step 6: Generate Requirements Checklist

Create `checklists/requirements.md` validating:
- User story quality
- Functional requirement completeness
- Success criteria measurability

### Step 7: Report Completion

Output:
- Feature branch name
- Spec file path
- Checklist results
- Sprint allocation recommendation
- Any clarifications needed

---

## Writing Principles

1. **WHAT/WHY, not HOW**: Focus on user needs, not implementation
2. **Technology-agnostic**: No framework/API specifics in requirements
3. **Business stakeholder audience**: Avoid technical jargon
4. **Testable requirements**: Every requirement must be verifiable
5. **Informed defaults**: Make reasonable assumptions, document them

---

## Integration with Sprint Management

### Automatic Updates

After specification creation:

1. **SPRINT-PLANNING.md**: Add feature to backlog with estimates
2. **SPRINT-INDEX.md**: Link to spec directory
3. **Specs Directory**: Create organized artifact storage

### Sprint Mapping

| Spec Priority | Sprint Allocation |
|---------------|-------------------|
| P1 stories only | Single sprint |
| P1 + P2 stories | Multi-sprint |
| P1 + P2 + P3 | Phased delivery |

---

## Clarification Handling

If `[NEEDS CLARIFICATION]` markers exist:

1. Present each unclear area as a question
2. Offer 2-5 options with recommended choice
3. Update spec with user's answer
4. Re-validate requirements checklist

---

## Output Format

```
## Specification Complete

**Feature**: [NNN]-[short-name]
**Branch**: `feature/[NNN]-[short-name]`
**Spec**: `Sprints/Specs/[NNN]-[short-name]/spec.md`

### User Stories
- US1: [title] (P1) - [X story points]
- US2: [title] (P2) - [X story points]

### Sprint Allocation
Recommended: [Single Sprint / Multi-Sprint]
- Sprint [N]: US1 implementation
- Sprint [N+1]: US2 implementation (if applicable)

### Checklist Status
Requirements: [X/Y complete]

### Next Steps
1. Review spec for accuracy
2. Run `/speckit.clarify` if clarifications needed
3. Run `/speckit.plan` to create implementation plan
```

---

## Error Handling

| Error | Resolution |
|-------|------------|
| No description provided | Prompt for feature description |
| Duplicate feature name | Increment feature number |
| Spec directory exists | Offer to update or create new |
