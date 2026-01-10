---
description: Create implementation plan from specification
---

# /speckit-plan - Implementation Planning

Creates a detailed implementation plan from a feature specification.

## Usage

```
/speckit-plan [feature-id]
```

If no feature-id provided, uses most recent specification.

## Prerequisites

- Specification exists: `Sprints/Specs/{feature-id}/spec.md`
- Requirements checklist reviewed
- No unresolved `[NEEDS CLARIFICATION]` markers

## Execution Steps

### 1. Load Specification

```python
spec_path = f"Sprints/Specs/{feature_id}/spec.md"
spec = read_file(spec_path)

# Verify prerequisites
if "[NEEDS CLARIFICATION]" in spec:
    error("Run /speckit-clarify first")
```

### 2. Phase 0: Research

Identify technical unknowns:
- API integrations needed
- Library selection
- Performance requirements
- Security considerations

Create `Sprints/Specs/{feature_id}/research.md`

### 3. Phase 1: Design

Generate design artifacts:

**data-model.md**:
```markdown
## Entity: User
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| email | String | Unique, Not Null |
| password_hash | String | Not Null |
```

**contracts/api.yaml**:
```yaml
paths:
  /api/auth/register:
    post:
      summary: Register new user
      requestBody: ...
      responses: ...
```

**quickstart.md**:
- Implementation guide
- Key decisions
- Getting started steps

### 4. Constitution Check

Validate against `memory/constitution.md`:

| Article | Check |
|---------|-------|
| I. Sprint-First | Fits sprint capacity |
| II. Spec-Driven | Plan derived from spec |
| III. Test-First | Test strategy included |
| VI. Simplicity | No premature abstraction |

**Gate**: Document justification for any complexity.

### 5. Generate Plan

Read template: `templates/speckit/plan-template.md`

Write to: `Sprints/Specs/{feature_id}/plan.md`

Contents:
- Technical context (stack, dependencies)
- Project structure
- Data model summary
- API contracts summary
- Sprint mapping
- Risk assessment

### 6. Sprint Mapping

Calculate sprint allocation:

```python
total_points = sum(story.points for story in spec.user_stories)

if total_points <= 13:
    sprints = 1
elif total_points <= 26:
    sprints = 2
elif total_points <= 40:
    sprints = 3
else:
    recommend_epic_decomposition()
```

Map phases to sprints:
- Sprint N: Setup + Foundation + US1
- Sprint N+1: US2 (if applicable)
- Sprint N+2: US3 + Polish (if applicable)

### 6.5. AI Discoverability Phase (Conditional)

**When**: `ai_discoverability.enabled: true` in sprint.config.yaml

If AI Discoverability is enabled, add an AI Discoverability phase to the plan:

```python
def add_ai_discoverability_phase(plan, config):
    """Add AI Discoverability phase when enabled."""

    if not config.ai_discoverability.enabled:
        return plan

    ai_phase = {
        "name": "AI Discoverability",
        "description": "Generate/update AI discoverability artifacts",
        "sprint_position": "end",  # Add at end of implementation phase
        "tasks": []
    }

    project_type = config.ai_discoverability.project_type

    # Web artifacts
    if project_type in ["web", "hybrid"]:
        ai_phase["tasks"].extend([
            "Update robots.txt if routes changed",
            "Regenerate sitemap.xml for new pages",
            "Update Schema.org markup if applicable",
        ])

    # API artifacts
    if project_type in ["api", "hybrid"]:
        ai_phase["tasks"].extend([
            "Update ai-plugin.json manifest",
            "Regenerate OpenAPI spec for new endpoints",
        ])

    # MCP server
    if config.ai_discoverability.mcp.enabled:
        ai_phase["tasks"].append("Update MCP server tool definitions")

    plan["phases"].append(ai_phase)
    return plan
```

**Add to plan.md:**

```markdown
## AI Discoverability Phase

> Auto-included when ai_discoverability.enabled is true

### Artifacts to Update

| Artifact | Condition | Action |
|----------|-----------|--------|
| sitemap.xml | New pages added | Regenerate |
| openapi.yaml | API endpoints changed | Regenerate |
| ai-plugin.json | Auth or metadata changed | Update |
| mcp-server | New tools added | Update |

### Checklist

- [ ] Detect changes requiring artifact updates
- [ ] Run `/ai-discover-generate` for affected artifacts
- [ ] Validate generated artifacts
- [ ] Commit artifact updates
```

### 7. Generate Design Checklist

Create `Sprints/Specs/{feature_id}/checklists/design.md`

### 8. Report

Output:
- Plan file path
- Artifacts created
- Sprint allocation
- Constitution compliance
- Next steps

---

## Output Example

```
## Implementation Plan Complete

**Feature**: 001-user-authentication
**Plan**: `Sprints/Specs/001-user-authentication/plan.md`

### Technical Summary
- Language: TypeScript
- Framework: Express.js
- Database: PostgreSQL
- Testing: Jest + Supertest

### Artifacts Created
- [x] plan.md
- [x] research.md
- [x] data-model.md
- [x] contracts/api.yaml
- [x] quickstart.md
- [x] checklists/design.md

### Sprint Allocation
- Sprint 12: Setup + Foundation + US1 (13 points)
- Sprint 13: US2 + US3 + Polish (6 points)

### Constitution Check
- [x] I. Sprint-First: 2 sprints allocated
- [x] II. Spec-Driven: Plan from spec
- [x] III. Test-First: Test strategy documented
- [x] VI. Simplicity: No premature abstraction

### Next Steps
1. Review plan.md
2. Complete design checklist
3. Run `/speckit-tasks 001-user-authentication`
4. Run `/sprint-new 12 user-auth-p1` to create sprint
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Spec not found | Run `/speckit-specify` first |
| Clarifications pending | Run `/speckit-clarify` first |
| Constitution violation | Document justification or revise |

---

## Integration Points

- **Before**: `/speckit-specify`, `/speckit-clarify`
- **After**: `/speckit-tasks`
- **Sprint**: Updates SPRINT-PLANNING.md with allocation
