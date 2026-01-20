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

#### Task Format Requirements

**Mandatory structure**:
```
- [ ] [TaskID] [Optional: P] [Optional: Story] Description with file path
```

**Component breakdown**:

1. **[TaskID]**: Sequential identifier
   - Format: `T001`, `T002`, ... `T999`
   - Zero-padded 3 digits
   - Globally unique within feature
   - No gaps in sequence

2. **[P]**: Parallel execution marker (optional)
   - Include if task can run in parallel with adjacent tasks
   - Example: Two independent file creation tasks can be [P]
   - Omit if task depends on previous task completion

3. **[Story]**: Story label (required for user story phases only)
   - Format: `[US1]`, `[US2]`, `[US3]`, etc.
   - Maps to User Story from spec.md
   - **Setup/Foundation phases**: Omit story label
   - **User Story phases**: Always include story label
   - **Polish phase**: Use `[POLISH]` label

4. **Description**: What needs to be done
   - **Action verb + object**: "Create auth middleware", not "Auth middleware"
   - **Specific file path**: Include actual file path or directory
   - **Technology-neutral**: "Write unit tests", not "Write Jest tests"
   - **One task per file/component**: Don't combine unrelated actions

**Examples of good task format**:
```markdown
✅ - [ ] T001 [P] [SETUP] Create project structure | src/, tests/, docs/
✅ - [ ] T008 [US1] Write unit tests for user registration | tests/unit/auth/register.test.ts
✅ - [ ] T010 [P] [US1] Implement registration endpoint | src/routes/auth/register.ts
✅ - [ ] T020 [POLISH] Update API documentation | docs/api.md
```

**Examples of bad task format**:
```markdown
❌ - [ ] T001 Project setup (missing file path, vague description)
❌ - [ ] T008 [US1] Tests (missing specific file path, too vague)
❌ - [ ] T010 [SETUP] [US1] Create endpoint | src/ (mixing SETUP with US1)
❌ - [ ] T020 Documentation (missing POLISH label, no file path)
❌ - [ ] Write tests and implement feature (two tasks, not one)
```

### 4. Phase Organization

**Phase structure requirements**:

**Phase 1: Setup** (Initial setup, no story labels)
- Project structure creation
- Environment configuration
- Dependency installation
- Build system setup
- No `[US#]` labels - use `[SETUP]` only

**Example**:
```markdown
## Phase 1: Setup

- [ ] T001 [P] [SETUP] Create project directory structure | src/, tests/, docs/
- [ ] T002 [P] [SETUP] Configure environment variables | .env.example
- [ ] T003 [SETUP] Install project dependencies | package.json
- [ ] T004 [SETUP] Configure build system | tsconfig.json, vite.config.ts
```

**Phase 2: Foundation** (Foundational blocking prerequisites, no story labels)
- Data models and types
- Database setup and migrations
- Shared utilities and middleware
- Test infrastructure
- No `[US#]` labels - use `[FOUNDATION]` only

**Example**:
```markdown
## Phase 2: Foundation

- [ ] T005 [P] [FOUNDATION] Define data models | src/models/user.ts
- [ ] T006 [P] [FOUNDATION] Create database schema | migrations/001_init.sql
- [ ] T007 [P] [FOUNDATION] Setup authentication middleware | src/middleware/auth.ts
- [ ] T008 [FOUNDATION] Create test fixtures | tests/fixtures/users.json
```

**Phases 3+: Individual User Stories** (One phase per user story, priority order)
- Implement user stories in priority sequence (P1 first)
- Each story gets own phase
- ALWAYS: Tests → Implementation → Verification
- ALL tasks labeled with story: `[US1]`, `[US2]`, etc.

**Example**:
```markdown
## Phase 3: US1 - User Registration

### Tests (Write FIRST - Article III)
- [ ] T009 [US1] Write unit tests for registration logic | tests/unit/auth/register.test.ts
- [ ] T010 [US1] Write integration tests for /register endpoint | tests/integration/auth.test.ts

### Implementation
- [ ] T011 [P] [US1] Implement registration service | src/services/auth/register.ts
- [ ] T012 [P] [US1] Create registration endpoint | src/routes/auth/register.ts
- [ ] T013 [US1] Connect registration flow | src/controllers/auth.controller.ts

### Verification
- [ ] T014 [US1] Run unit tests - verify pass | npm test
- [ ] T015 [US1] Run integration tests - verify pass | npm run test:integration
- [ ] T016 [US1] Manual verification of registration flow | Run local server

## Phase 4: US2 - User Login

### Tests (Write FIRST - Article III)
- [ ] T017 [US2] Write unit tests for login logic | tests/unit/auth/login.test.ts
- [ ] T018 [US2] Write integration tests for /login endpoint | tests/integration/auth.test.ts

### Implementation
- [ ] T019 [P] [US2] Implement login service | src/services/auth/login.ts
- [ ] T020 [P] [US2] Create login endpoint | src/routes/auth/login.ts
- [ ] T021 [US2] Add session management | src/middleware/session.ts

### Verification
- [ ] T022 [US2] Run tests - verify pass | npm test
```

**Final Phase: Polish** (Cross-cutting improvements)
- Documentation updates
- Performance optimization
- Error handling improvements
- Code cleanup
- All tasks labeled `[POLISH]`

**Example**:
```markdown
## Phase 5: Polish

- [ ] T023 [P] [POLISH] Update README with setup instructions | README.md
- [ ] T024 [P] [POLISH] Add API documentation | docs/api.md
- [ ] T025 [P] [POLISH] Add inline code comments | src/
- [ ] T026 [POLISH] Final code review and cleanup | All files
```

**Phase ordering rules**:
1. Setup → Foundation → User Stories → Polish
2. User Stories ordered by priority (P1 before P2 before P3)
3. Within user story: Tests before implementation (Article III)
4. Dependencies must be satisfied (Foundation before US1)

### 4.5. MVP Scope Identification

**Goal**: Identify minimum viable task set for early value delivery

**Strategy**:
1. **Suggest User Story 1 as MVP**
   - US1 is typically highest priority (P1)
   - Setup + Foundation + US1 = Minimum viable product
   - Can be deployed and validated independently

2. **Calculate MVP task set**
   ```python
   mvp_tasks = []
   mvp_tasks.extend(setup_phase_tasks)      # Phase 1
   mvp_tasks.extend(foundation_phase_tasks) # Phase 2
   mvp_tasks.extend(us1_phase_tasks)        # Phase 3

   mvp_task_count = len(mvp_tasks)
   total_task_count = count_all_tasks()

   print(f"MVP: {mvp_task_count}/{total_task_count} tasks")
   print(f"Percentage: {(mvp_task_count/total_task_count)*100:.1f}%")
   ```

3. **Document what can be deferred**
   - **Deferred to post-MVP**: US2, US3, Polish phase
   - **Benefit**: Early validation, faster feedback loop
   - **Risk mitigation**: Can pivot based on US1 validation

**Example MVP documentation**:
```markdown
## MVP Scope (Recommended)

**MVP = Setup + Foundation + US1** (Tasks T001-T016)

### Included in MVP:
- ✅ Phase 1: Setup (T001-T004)
- ✅ Phase 2: Foundation (T005-T008)
- ✅ Phase 3: US1 - User Registration (T009-T016)

### Deferred to post-MVP:
- ⏸️ Phase 4: US2 - User Login (T017-T022)
- ⏸️ Phase 5: Polish (T023-T026)

### MVP Benefits:
- **Early validation**: Test core value proposition with US1
- **Faster feedback**: Deploy in 1 sprint vs. 2 sprints
- **Reduced risk**: Pivot based on real user feedback

### Deployment Strategy:
1. Complete MVP tasks (T001-T016)
2. Deploy to staging
3. Validate with test users
4. If successful: Continue with US2
5. If issues: Fix or pivot based on feedback
```

### 4.6. AI Discoverability Tasks (Conditional)

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

**Purpose**: Visualize task dependencies and identify parallelization opportunities

**When to create**:
- For complex features (10+ tasks)
- When multiple parallel execution paths exist
- To communicate execution order to developers

**How to generate**:

1. **Identify blocking relationships**
   - Task A blocks Task B if B requires A's output
   - Example: "Create data model" blocks "Write tests using model"

2. **Mark parallel opportunities**
   - Tasks with no dependencies can run in parallel
   - Example: Multiple independent file creation tasks

3. **Create visualization**
   ```
   Legend:
   ─> : Blocking dependency (B depends on A)
   ─┬─> : Fork (A enables multiple parallel tasks)
   ─┤ : Join (Multiple tasks must complete before proceeding)
   [P] : Parallelizable task
   ```

**Example dependency graph**:
```
Setup Phase:
T001 [P] ─┬─> T004 (T001 creates structure needed by T004)
T002 [P] ─┤
T003 [P] ─┘

Foundation Phase:
T004 ─┬─> T008 (Models needed for tests)
T005 ─┤ (DB needed for tests)
T006 ─┤ (Middleware needed for tests)
T007 ─┘ (Fixtures needed for tests)

User Story Phase:
T008 ─> T011 (Tests must exist before implementation)
T009 ─> T012 (Tests must exist before implementation)
T010 ─> T013 (Tests must exist before implementation)

T011 [P] ─┬─> T014 (All implementations must complete before verification)
T012 [P] ─┤
T013 [P] ─┘
```

**Interpretation for execution**:
- **Critical path**: T001 → T004 → T008 → T011 → T014
- **Parallel opportunities**:
  - T001, T002, T003 can run simultaneously
  - T011, T012, T013 can run simultaneously
- **Execution time**: Critical path determines minimum time

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
