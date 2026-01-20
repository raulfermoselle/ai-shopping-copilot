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
- Templates available in `.claude/templates/`:
  - `plan-template.md`
  - `research-template.md`
  - `data-model-template.md`
  - `contracts-template.yaml`

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

**Goal**: Resolve all technical unknowns before design begins.

**Step-by-step execution**:

1. **Extract NEEDS CLARIFICATION items from spec**
   - Search spec for `[NEEDS CLARIFICATION]` markers
   - List all technical unknowns from User Scenarios and Functional Requirements
   - Prioritize by impact: architectural > feature > UI

2. **For each clarification/unknown**:
   - **Investigate**: Search codebase, read documentation, check existing patterns
   - **Research approach**: Document how you investigated (files examined, documentation consulted)
   - **Decision**: Choose an approach based on findings
   - **Rationale**: Explain why this choice aligns with project architecture
   - **Alternatives**: List other options considered and why they were rejected
   - **References**: Link to documentation, ADRs, or codebase files examined

3. **Create research.md**
   - Use template: `.claude/templates/research-template.md`
   - Location: `Sprints/Specs/{feature_id}/research.md`
   - Fill all sections with investigation findings
   - Include summary table of key technical decisions

4. **Key areas to research**:
   - API integrations needed (existing endpoints vs. new)
   - Library selection (use existing vs. add new dependency)
   - Performance requirements (latency targets, throughput)
   - Security considerations (auth, validation, encryption)
   - Data storage strategy (database, file system, memory)
   - Error handling patterns (follow existing conventions)

**Gate**: Must resolve ALL clarifications before proceeding to design.

### 3. Phase 1: Design

**Goal**: Create detailed design artifacts ready for implementation.

#### Step 1a: Data Modeling

1. **Extract entities from spec**
   - Review User Scenarios for nouns (entities)
   - Review Functional Requirements for data structures
   - Identify relationships between entities

2. **For each entity, define**:
   - **Fields**: Name, type, required/optional, validation rules
   - **Relationships**: One-to-many, many-to-many, one-to-one
   - **State transitions**: For stateful entities (e.g., Order: draft → pending → active)
   - **Business rules**: Validation constraints, computed fields, invariants

3. **Document storage strategy**:
   - Database vs. file system vs. memory
   - Indexes for query optimization
   - Migration strategy if changing existing schema

4. **Create data-model.md**:
   - Use template: `.claude/templates/data-model-template.md`
   - Location: `Sprints/Specs/{feature_id}/data-model.md`
   - Include TypeScript types and Zod schemas
   - Document all entities with complete field definitions

**Example structure**:
```markdown
## Entity: User
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| id | UUID | Yes | Valid UUID v4 | Unique identifier |
| email | String | Yes | Valid email format, Unique | User email |
| password_hash | String | Yes | Min 60 chars (bcrypt) | Password hash |
| createdAt | Date | Yes | ISO 8601 | Creation timestamp |
```

#### Step 1b: Contract Generation

1. **Map user actions to endpoints**:
   - Each user action from spec → API endpoint or internal function
   - Use REST patterns where applicable: GET/POST/PUT/DELETE
   - For internal APIs, define function signatures

2. **For each endpoint, define**:
   - **Path and method**: `POST /api/auth/register`
   - **Request schema**: Parameters, body, headers
   - **Response schema**: Success response structure
   - **Error cases**: All possible error responses with codes
   - **Authentication**: Required permissions or tokens
   - **Side effects**: What else happens (emails, webhooks, cache updates)

3. **Create contracts/api.yaml**:
   - Use template: `.claude/templates/contracts-template.yaml`
   - Location: `Sprints/Specs/{feature_id}/contracts/api.yaml`
   - Include all endpoints with complete schemas
   - Document error handling and rate limiting

**Example structure**:
```yaml
endpoints:
  - name: "Register User"
    path: "POST /api/auth/register"
    request_body:
      schema:
        type: object
        properties:
          email: {type: string, format: email}
          password: {type: string, minLength: 8}
    response_success:
      status: 201
      schema:
        properties:
          userId: {type: string, format: uuid}
          token: {type: string}
    response_errors:
      - status: 400
        code: "VALIDATION_ERROR"
      - status: 409
        code: "EMAIL_EXISTS"
```

#### Step 1c: Quickstart Guide

1. **Create quickstart.md**:
   - Location: `Sprints/Specs/{feature_id}/quickstart.md`
   - Reference research.md for key technical decisions
   - Reference data-model.md for entity overview
   - Reference contracts/api.yaml for API endpoints

2. **Include in quickstart**:
   - **Prerequisites**: What developers need installed
   - **Setup steps**: Clone, install, configure
   - **Key files to read**: Entry points, core modules
   - **Running locally**: Development commands
   - **Running tests**: Test commands
   - **Architecture overview**: High-level component diagram

3. **Link to other artifacts**:
   - "See research.md for technical decisions"
   - "See data-model.md for entity definitions"
   - "See contracts/api.yaml for API contracts"

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

**Use template**: `.claude/templates/plan-template.md`

**Write to**: `Sprints/Specs/{feature_id}/plan.md`

**Fill template sections**:
1. **Summary**: 1-2 paragraph feature overview
2. **Technical Context**: All 9 specifications (Language, Dependencies, Storage, Testing, Platform, Type, Performance, Constraints, Scale)
3. **Constitution Check**: Verify compliance with all relevant articles
4. **Project Structure**: Directory tree showing new files
5. **Research Outcomes**: Reference research.md, summarize key decisions
6. **Data Model**: Reference data-model.md, list entities
7. **API Contracts**: Reference contracts/api.yaml, list endpoints
8. **Complexity Tracking**: Rate each component Low/Medium/High, calculate story points
9. **Sprint Mapping**: (Filled by next step - leave as placeholder)
10. **Quickstart**: Copy from quickstart.md
11. **Risks & Mitigations**: Identify potential blockers
12. **Success Criteria**: Copy from spec.md

**Template placeholders to replace**:
- `{FEATURE_NAME}` → Feature ID and title
- `{BRANCH_NAME}` → Git branch name
- `{DATE}` → Current date
- `{SPEC_PATH}` → Path to spec.md
- All other `{PLACEHOLDER}` values with actual content

### 5.5. Templates Guide

**Template locations**:
- Plan: `.claude/templates/plan-template.md`
- Research: `.claude/templates/research-template.md`
- Data Model: `.claude/templates/data-model-template.md`
- Contracts: `.claude/templates/contracts-template.yaml`

**How to use templates**:

1. **Read template file** to understand structure
2. **Copy template content** to target location
3. **Replace all `{PLACEHOLDER}` values** with actual content
4. **Fill in all sections** - no sections should remain with placeholder text
5. **Customize where needed** - templates are starting points, adapt to feature needs
6. **Validate completeness** - ensure no `{PLACEHOLDER}` markers remain

**When to customize vs. use as-is**:
- **Use as-is**: Standard structure works for most features
- **Customize**: Feature has unique requirements (e.g., special state machine, complex relationships)
- **Add sections**: If template missing something important for this feature
- **Remove sections**: If section truly not applicable (rare - usually better to write "N/A")

**Template section mapping**:

| Artifact | Template | Output Location |
|----------|----------|-----------------|
| Implementation Plan | `plan-template.md` | `Sprints/Specs/{id}/plan.md` |
| Research | `research-template.md` | `Sprints/Specs/{id}/research.md` |
| Data Model | `data-model-template.md` | `Sprints/Specs/{id}/data-model.md` |
| API Contracts | `contracts-template.yaml` | `Sprints/Specs/{id}/contracts/api.yaml` |
| Quickstart | (Custom - no template) | `Sprints/Specs/{id}/quickstart.md` |

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
