# Spec-Kit Pipeline

Detailed documentation of each pipeline stage in the specification-driven development workflow.

## Stage 1: Specify

**Purpose**: Define what the feature does and why it matters.

**Trigger Phrases**:
- "specify feature X"
- "create specification for X"
- "define requirements for X"
- "new feature: X"

**Input Required**:
- Feature name/description
- High-level requirements
- User context (who benefits)

**Process**:
1. Generate feature ID (e.g., 001-user-authentication)
2. Create directory: Sprints/Specs/{feature-id}/
3. Generate spec.md from template
4. Fill in known requirements
5. Mark unclear items for clarification

**Output**: spec.md

---

## Stage 2: Clarify

**Purpose**: Resolve ambiguities and answer open questions.

**Trigger Phrases**:
- "clarify the spec"
- "answer questions for X"
- "resolve ambiguities"

**Input Required**:
- Existing spec.md
- Answers to open questions (from user or research)

**Process**:
1. Read existing spec.md
2. Identify open questions
3. For each question: research codebase, ask user if needed, document answer
4. Update spec.md with clarifications
5. Mark questions as resolved

**Output**: Updated spec.md with resolved questions

**Completion Criteria**:
- All questions in "Open Questions" resolved
- No TBD or placeholder values remain
- User stories are specific and testable

---

## Stage 3: Plan

**Purpose**: Design the implementation approach.

**Trigger Phrases**:
- "plan implementation"
- "design the feature"
- "create implementation plan"
- "how should we build X"

**Input Required**:
- Completed spec.md (no open questions)

**Process**:
1. Analyze requirements from spec.md
2. Research existing codebase patterns
3. Design architecture/approach
4. Identify components to create/modify
5. Define data models if needed
6. Define API contracts if needed
7. Generate plan.md

**Output**: plan.md, optionally data-model.md, api-contract.md

---

## Stage 4: Tasks

**Purpose**: Break down implementation into executable tasks.

**Trigger Phrases**:
- "create tasks"
- "generate task breakdown"
- "break down into tasks"
- "what tasks are needed"

**Input Required**:
- Completed spec.md
- Completed plan.md

**Process**:
1. Analyze plan.md for work items
2. Group by phase (Setup, Implementation, Verification)
3. For each user story, create test task then implementation task
4. Add cross-cutting tasks (docs, integration)
5. Ensure max 5-7 tasks per sprint
6. Generate tasks.md

**Output**: tasks.md

---

## Stage 5: Implement

**Purpose**: Execute tasks via sprint management.

**Trigger Phrases**:
- "implement the feature"
- "start implementation"
- "execute tasks"

**Input Required**:
- Completed tasks.md
- Completed checklists/requirements.md (recommended)
- Completed checklists/design.md (recommended)

**Process**:
1. Verify prerequisites (checklists if required)
2. Create sprint from tasks.md
3. Delegate to sprint-management skill
4. Sprint-executor agent executes tasks
5. Test-runner agent verifies tests
6. Track progress in sprint artifacts

**Output**: Code changes, SPRINT-LOG.md updates

---

## Stage 6: Analyze

**Purpose**: Validate implementation against specification.

**Trigger Phrases**:
- "analyze implementation"
- "validate against spec"
- "check consistency"
- "review feature X"

**Input Required**:
- Completed spec.md
- Completed implementation (code)
- Test results

**Process**:
1. Read spec.md requirements
2. Read implemented code
3. For each requirement verify implementation and tests
4. Identify any gaps or inconsistencies
5. Generate analysis report
6. Delegate detailed review to code-reviewer agent

**Output**: Analysis report

---

## Stage 7: Checklist

**Purpose**: Final verification before completion.

**Trigger Phrases**:
- "generate checklist"
- "create verification checklist"
- "final verification"

**Input Required**:
- All previous artifacts
- Implementation complete
- Analysis complete

**Process**:
1. Generate requirements checklist
2. Generate design checklist
3. Generate implementation checklist
4. Walk through each item
5. Mark items as verified
6. Report completion status

**Output**: checklists/requirements.md, checklists/design.md, checklists/implementation.md

---

## Pipeline State Machine

```
        +--------------------------------------+
        |                                      |
        v                                      |
    [SPECIFY] --> [CLARIFY] --> [PLAN] --> [TASKS]
                      |                        |
                      | (if questions arise)   |
                      +------------------------+
                                               |
                                               v
    [COMPLETE] <-- [CHECKLIST] <-- [ANALYZE] <-- [IMPLEMENT]
        |                                          |
        | (if issues found)                        |
        +------------------------------------------+
```

## Automatic Stage Detection

The skill detects current stage by checking which artifacts exist:

| Artifacts Present | Current Stage | Next Stage |
|-------------------|---------------|------------|
| None | - | Specify |
| spec.md only | Specify | Clarify/Plan |
| spec.md + plan.md | Plan | Tasks |
| spec.md + plan.md + tasks.md | Tasks | Implement |
| All + code changes | Implement | Analyze |
| All + analysis | Analyze | Checklist |
| All + checklists complete | Complete | - |

## Legacy Command Support

The skill auto-triggers, but legacy commands still work:

| Legacy Command | Maps To |
|----------------|---------|
| /speckit-specify | Specify stage |
| /speckit-clarify | Clarify stage |
| /speckit-plan | Plan stage |
| /speckit-tasks | Tasks stage |
| /speckit-implement | Implement stage |
| /speckit-analyze | Analyze stage |
| /speckit-checklist | Checklist stage |
