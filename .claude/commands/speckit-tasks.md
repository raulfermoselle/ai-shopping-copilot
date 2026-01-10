---
description: Generate task breakdown from implementation plan
---

# /speckit-tasks - Task Generation

Generates a structured, executable task list from an implementation plan.

## Usage

```
/speckit-tasks [feature-id]
```

## Prerequisites

- Implementation plan exists: `Sprints/Specs/{feature-id}/plan.md`
- Design checklist completed
- Data model and contracts defined

## Execution Steps

### 1. Load Design Artifacts

```python
feature_dir = f"Sprints/Specs/{feature_id}"

# Required
plan = read_file(f"{feature_dir}/plan.md")
spec = read_file(f"{feature_dir}/spec.md")

# Optional
data_model = read_file_if_exists(f"{feature_dir}/data-model.md")
contracts = glob(f"{feature_dir}/contracts/*.yaml")
research = read_file_if_exists(f"{feature_dir}/research.md")
```

### 2. Extract Components

From spec.md:
- User stories with priorities
- Acceptance criteria

From plan.md:
- Technology stack
- Project structure
- Phase breakdown

From data-model.md:
- Entities to create
- Relationships

From contracts/:
- Endpoints to build
- Request/response handling

### 3. Generate Tasks

Use template: `templates/speckit/tasks-template.md`

#### Task Format
```
- [ ] [TaskID] [P] [Story] Description | file/path
```

- `[TaskID]`: T001, T002, etc.
- `[P]`: Parallel marker (optional)
- `[Story]`: US1, US2, SETUP, FOUNDATION, POLISH
- Description with file path

### 4. Phase Organization

**Phase 1: Setup** (T001-T003)
```markdown
- [ ] T001 [P] [SETUP] Initialize project structure | src/
- [ ] T002 [P] [SETUP] Configure environment | .env.example
- [ ] T003 [SETUP] Install dependencies | package.json
```

**Phase 2: Foundation** (T004-T007)
```markdown
- [ ] T004 [P] [FOUNDATION] Create data models | src/models/
- [ ] T005 [P] [FOUNDATION] Setup database | migrations/
- [ ] T006 [P] [FOUNDATION] Configure routes | src/routes/
- [ ] T007 [FOUNDATION] Setup test fixtures | tests/fixtures/
```

**Phase 3+: User Stories**
```markdown
## Phase 3: US1 - [Title]

### Tests (Write FIRST)
- [ ] T008 [US1] Write unit tests | tests/unit/
- [ ] T009 [US1] Write integration tests | tests/integration/

### Implementation
- [ ] T010 [P] [US1] Implement component A | src/
- [ ] T011 [P] [US1] Implement component B | src/
- [ ] T012 [US1] Connect components | src/index.ts

### Verification
- [ ] T013 [US1] Run tests - verify pass | npm test
```

**Final Phase: Polish**
```markdown
- [ ] T020 [P] [POLISH] Update README | README.md
- [ ] T021 [P] [POLISH] Add documentation | docs/
- [ ] T022 [POLISH] Final review
```

### 4.5. AI Discoverability Tasks (Conditional)

**When**: `ai_discoverability.enabled: true` in sprint.config.yaml

If AI Discoverability is enabled, add tasks at the end of the implementation phase:

```python
def add_ai_discoverability_tasks(tasks, config, task_counter):
    """Add AI Discoverability tasks when enabled."""

    if not config.ai_discoverability.enabled:
        return tasks, task_counter

    ai_tasks = []
    project_type = config.ai_discoverability.project_type

    # Web artifacts
    if project_type in ["web", "hybrid"]:
        ai_tasks.extend([
            f"T{task_counter:03d} [P] [AI-DISC] Update robots.txt | {config.ai_discoverability.output.web_root}robots.txt",
            f"T{task_counter+1:03d} [P] [AI-DISC] Regenerate sitemap.xml | {config.ai_discoverability.output.web_root}sitemap.xml",
            f"T{task_counter+2:03d} [P] [AI-DISC] Update Schema.org markup | {config.ai_discoverability.output.web_root}schema.jsonld",
        ])
        task_counter += 3

    # API artifacts
    if project_type in ["api", "hybrid"]:
        ai_tasks.extend([
            f"T{task_counter:03d} [P] [AI-DISC] Update ai-plugin.json | {config.ai_discoverability.output.well_known}ai-plugin.json",
            f"T{task_counter+1:03d} [AI-DISC] Regenerate OpenAPI spec | {config.ai_discoverability.output.api_docs}openapi.yaml",
        ])
        task_counter += 2

    # MCP server
    if config.ai_discoverability.mcp.enabled:
        ai_tasks.append(f"T{task_counter:03d} [AI-DISC] Update MCP tool definitions | {config.ai_discoverability.output.mcp_server}src/tools/")
        task_counter += 1

    # Validation
    ai_tasks.append(f"T{task_counter:03d} [AI-DISC] Validate all AI discoverability artifacts")
    task_counter += 1

    tasks.extend(ai_tasks)
    return tasks, task_counter
```

**Generated tasks in tasks.md:**

```markdown
## Phase X: AI Discoverability

> Auto-generated when ai_discoverability.enabled is true
> Run `/ai-discover-generate` to execute these tasks

### Web Artifacts (if web/hybrid)
- [ ] T0XX [P] [AI-DISC] Update robots.txt | public/robots.txt
- [ ] T0XX [P] [AI-DISC] Regenerate sitemap.xml | public/sitemap.xml
- [ ] T0XX [P] [AI-DISC] Update Schema.org markup | public/schema.jsonld

### API Artifacts (if api/hybrid)
- [ ] T0XX [P] [AI-DISC] Update ai-plugin.json | .well-known/ai-plugin.json
- [ ] T0XX [AI-DISC] Regenerate OpenAPI spec | docs/api/openapi.yaml

### MCP Server (if mcp.enabled)
- [ ] T0XX [AI-DISC] Update MCP tool definitions | mcp-server/src/tools/

### Verification
- [ ] T0XX [AI-DISC] Validate all artifacts
- [ ] T0XX [AI-DISC] Test AI plugin endpoint

**AI Discoverability Complete Criteria**:
- [ ] All artifacts valid (no validation errors)
- [ ] Artifacts reflect current codebase state
- [ ] sitemap.xml includes all new pages
- [ ] openapi.yaml includes all new endpoints
```

**Task Count Adjustment:**

When calculating total tasks, include AI Discoverability:

```python
def calculate_task_count(config):
    base_tasks = count_implementation_tasks()

    ai_tasks = 0
    if config.ai_discoverability.enabled:
        ai_tasks += 2  # Base: detection + validation
        if config.ai_discoverability.project_type in ["web", "hybrid"]:
            ai_tasks += 3  # robots, sitemap, schema
        if config.ai_discoverability.project_type in ["api", "hybrid"]:
            ai_tasks += 2  # plugin, openapi
        if config.ai_discoverability.mcp.enabled:
            ai_tasks += 1  # MCP update

    return base_tasks + ai_tasks
```

### 5. Test-First Enforcement

For each user story:
1. Test tasks MUST precede implementation tasks
2. Tests MUST fail before implementation
3. Implementation makes tests pass

### 6. Dependency Graph

Generate dependency visualization:
```
T001 ─┬─> T003 ───> T004 ─┬─> T007 ─> T008 ─> T010
T002 ─┘              T005 ─┤
                     T006 ─┘
```

### 7. Sprint Task Mapping

Map tasks to SPRINT-PLAN.md format:

```markdown
## Task Breakdown (from speckit)

| ID | Task | Priority | Status | Source |
|----|------|----------|--------|--------|
| T001 | Initialize project | HIGH | PENDING | speckit:T001 |
| T002 | Configure environment | HIGH | PENDING | speckit:T002 |
```

### 8. Write Tasks

Output to: `Sprints/Specs/{feature_id}/tasks.md`

### 9. Report

Output summary and next steps.

---

## Output Example

```
## Task Generation Complete

**Feature**: 001-user-authentication
**Tasks**: `Sprints/Specs/001-user-authentication/tasks.md`

### Task Summary
| Phase | Count | Parallelizable |
|-------|-------|----------------|
| Setup | 3 | 2 |
| Foundation | 4 | 3 |
| US1 | 8 | 4 |
| US2 | 6 | 3 |
| Polish | 4 | 3 |
| **Total** | **25** | **15** |

### Sprint Allocation
- Sprint 12: T001-T015 (Setup + Foundation + US1)
- Sprint 13: T016-T025 (US2 + Polish)

### Execution Strategy
MVP-First recommended:
1. Complete Sprint 12 (US1)
2. Deploy and validate
3. Continue Sprint 13 (US2)

### Next Steps
1. Review tasks.md
2. Run `/speckit-analyze 001-user-authentication` for consistency check
3. Run `/sprint-new 12 user-auth-p1` to create sprint
4. Copy tasks to SPRINT-PLAN.md
5. Run `/sprint-start 12` to begin execution
```

---

## Sprint Integration

### Copy to Sprint Plan

After task generation, tasks are formatted for SPRINT-PLAN.md:

```markdown
## Task Breakdown

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T001 | Initialize project structure | HIGH | PENDING |
| T002 | Configure environment | HIGH | PENDING |
| T003 | Install dependencies | HIGH | PENDING |
| ... | ... | ... | ... |
```

### Traceability

Each task maintains source link:
- `Source: speckit:T001`
- Enables analysis and reporting
- Supports constitution compliance

---

## Error Handling

| Error | Action |
|-------|--------|
| Plan not found | Run `/speckit-plan` first |
| Design checklist incomplete | Complete checklist first |
| No user stories | Update spec with stories |
| Exceeds capacity | Split into multiple sprints |

---

## Integration Points

- **Before**: `/speckit-plan`
- **After**: `/speckit-analyze`, `/sprint-new`
- **Sprint**: Tasks copied to SPRINT-PLAN.md
