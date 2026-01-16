---
description: Execute a task using the full planning-review-implement-review cycle
---

# Task Execution Workflow

Execute a complete task using the sprint-based workflow with quality gates.

## Overview

This command orchestrates a full task execution cycle by **chaining commands via the Skill tool**.

```
[Pre-flight] → Verify branch, check state
      ↓
[Phase 1: Planning]
      → /sprint-new (create planning sprint)
      → Fill SPRINT-PLAN.md
      → /plan-review (validate plan)
      → User approval gate ←─── GATE 1
      → /sprint-complete
      ↓
[Phase 2: Implementation] (loop until all tasks done)
      → /sprint-new (create impl sprint)
      → Implement tasks
      → /code-review (validate code)
      → Fix issues if any
      → /sprint-complete
      → User approval gate ←─── GATE 2
      ↓
[Phase 3: Documentation]
      → /docs-audit (check documentation)
      → Fill gaps if any
      ↓
[Phase 4: Completion]
      → Summary
      → /create-pr (optional, user chooses)
      → Final output
```

---

## Pre-flight Checks

Before starting, verify:

### 1. Branch Safety

```bash
git branch --show-current
```

| Current Branch | Action |
|----------------|--------|
| `main`, `master`, `develop` | **STOP** - Ask user to create/switch to feature branch |
| `feat/*`, `fix/*`, etc. | **PROCEED** - Valid feature branch |

### 2. Check Existing State

```bash
cat Sprints/.sprint-state.local
```

If active sprint exists with status `IN_PROGRESS`:
- Ask user: Continue existing sprint? Or start fresh?

---

## Phase 1: Planning

### Step 1.1: Create Planning Sprint

**Invoke via Skill tool:**
```
Skill(skill: "sprint-new", args: "planning-{task-short-name}")
```

This creates:
- `Sprints/Active/{branch}/Sprint-{branch}-{NN}-planning-{name}/`
- `SPRINT-PLAN.md` (template)
- `SPRINT-LOG.md` (template)
- Updates all state files

### Step 1.2: Fill the Sprint Plan

**You do this directly** (not a sub-command):

1. **Explore the codebase** using Grep, Glob, Read:
   - Find existing patterns
   - Identify related files
   - Understand dependencies

2. **Read guardrails** from `.claude/rules/`:
   - security.md
   - documentation-system.md

3. **Edit SPRINT-PLAN.md** with:
   - Sprint Goals (5-7 max objectives)
   - Task Breakdown (T001, T002, etc. - max 7 tasks)
   - Technical Approach
   - Files to Modify
   - Dependencies and Risks

### Step 1.3: Review the Plan

**Invoke via Skill tool:**
```
Skill(skill: "plan-review")
```

This validates against:
- Objective alignment
- Code pattern compliance
- Guardrail compliance
- Completeness
- Feasibility

### Step 1.4: Handle Review Result

| Result | Action |
|--------|--------|
| `APPROVED` | Proceed to Step 1.5 |
| `NEEDS_REVISION` | Fix issues in SPRINT-PLAN.md, re-run Step 1.3 |
| `USER_DECISION_REQUIRED` | Present trade-offs to user via `AskUserQuestion`, update plan, re-run Step 1.3 |

### Step 1.5: User Approval Gate

**Use ExitPlanMode** to present the plan:

```
ExitPlanMode(allowedPrompts: [
  {tool: "Bash", prompt: "run tests"},
  {tool: "Bash", prompt: "run build"}
])
```

Present summary:
- Number of tasks
- Key changes planned
- Files to be modified

**Wait for explicit user approval.**

| User Response | Action |
|---------------|--------|
| Approve | Proceed to Step 1.6 |
| Reject | Update plan based on feedback, go back to Step 1.3 |

### Step 1.6: Complete Planning Sprint

**Invoke via Skill tool:**
```
Skill(skill: "sprint-complete")
```

---

## Phase 2: Implementation

### Step 2.1: Get Tasks from Plan

Read `SPRINT-PLAN.md` from the planning sprint.
Extract all tasks (T001, T002, etc.).

### Step 2.2: Implementation Loop

```
remaining_tasks = [all tasks from plan]
impl_number = 1

WHILE remaining_tasks is not empty:

    # 2.2.1: Create Implementation Sprint
    Skill(skill: "sprint-new", args: "impl-{name}-{impl_number}")

    # 2.2.2: Implement Each Task (max 7 per sprint)
    current_batch = remaining_tasks[0:7]

    FOR task in current_batch:
        - Edit SPRINT-LOG.md: Mark task IN_PROGRESS
        - Implement the code (Edit, Write tools)
        - Run tests if applicable (Bash)
        - Edit SPRINT-LOG.md: Mark COMPLETED, list files

    # 2.2.3: Code Review
    Skill(skill: "code-review")

    # 2.2.4: Handle Review Result
    IF result == FIX_ALL_ISSUES:
        - Fix EACH issue using Edit tool
        - Update SPRINT-LOG.md with fixes
        - Re-run: Skill(skill: "code-review")
        - Repeat until APPROVED_COMPLETE

    # 2.2.5: Complete Implementation Sprint
    Skill(skill: "sprint-complete")

    # 2.2.6: Update remaining
    remaining_tasks = remaining_tasks - current_batch
    impl_number += 1
```

### Step 2.3: Issue Fixing

When `/code-review` returns `FIX_ALL_ISSUES`:

1. Read the issues table from review output
2. **You fix each issue directly:**
   - Read the file
   - Apply fix using Edit tool
   - Document fix in SPRINT-LOG.md
3. Re-run `/code-review`
4. Repeat until `APPROVED_COMPLETE`

### Step 2.4: User Approval Gate (Post-Implementation)

After ALL implementation sprints pass code review, present implementation summary to user:

**Use AskUserQuestion** to get approval:

```
AskUserQuestion(questions: [{
  question: "Implementation complete. Ready to proceed to documentation phase?",
  header: "Impl Done",
  options: [
    {label: "Approve", description: "Proceed to documentation audit"},
    {label: "Review Changes", description: "Show me the files modified before proceeding"},
    {label: "Reject", description: "I need changes to the implementation"}
  ]
}])
```

Present summary:
- Tasks completed: X/Y
- Files modified (list)
- Any blocked tasks
- Tests status (if run)

| User Response | Action |
|---------------|--------|
| **Approve** | Proceed to Phase 3 (Documentation) |
| **Review Changes** | Show detailed diff or file list, then ask again |
| **Reject** | User provides feedback, create new impl sprint to address |

**Rejection Flow:**
```
User rejects implementation
       ↓
User provides feedback
       ↓
Create new implementation sprint with fixes
       ↓
Implement fixes
       ↓
/code-review
       ↓
Back to Step 2.4 (User Approval)
```

---

## Phase 3: Documentation

### Step 3.1: Documentation Audit

**Invoke via Skill tool:**
```
Skill(skill: "docs-audit")
```

This checks:
- CLAUDE.md files in modified directories
- docs/ folders if architecture changed
- Code comments for complex logic

### Step 3.2: Handle Audit Result

| Result | Action |
|--------|--------|
| `DOCS_COMPLETE` | Proceed to Phase 4 |
| `DOCS_GAPS_FOUND` | Fill gaps, re-run audit |

### Step 3.3: Fill Documentation Gaps

**You do this directly:**

For each gap:
- CLAUDE.md missing → Create per `.claude/rules/documentation-system.md`
- CLAUDE.md outdated → Update with changes
- docs/ needs update → Update relevant files

Re-run `/docs-audit` until `DOCS_COMPLETE`.

---

## Phase 4: Completion

### Step 4.1: Generate Summary

```markdown
## Task Execution Complete

**Task**: {original task}
**Branch**: {branch name}

### Sprints Executed
| Sprint | Type | Tasks |
|--------|------|-------|
| {planning-sprint} | Planning | - |
| {impl-sprint-1} | Implementation | T001-T005 |

### Files Modified
- `{file1}`: {brief description}
- `{file2}`: {brief description}

### Ready for Merge
Branch is ready for PR to develop.
```

### Step 4.2: Ask About PR Creation

**Use AskUserQuestion** to offer PR creation:

```
AskUserQuestion(questions: [{
  question: "Task complete! Would you like to create a PR to develop?",
  header: "Create PR",
  options: [
    {label: "Create PR", description: "Create pull request to develop branch"},
    {label: "Create Draft PR", description: "Create as draft for further review"},
    {label: "Skip", description: "I'll create the PR manually later"}
  ]
}])
```

| User Response | Action |
|---------------|--------|
| **Create PR** | Invoke `/create-pr` |
| **Create Draft PR** | Invoke `/create-pr --draft` |
| **Skip** | End workflow, show manual instructions |

### Step 4.3: Create Pull Request (if requested)

**Invoke via Skill tool:**
```
Skill(skill: "create-pr")
```

This will:
- Generate PR title from branch name
- Generate PR body from sprint data
- Create PR via `gh pr create`
- Return PR URL

### Step 4.4: Final Output

```markdown
## Workflow Complete

**Task**: {original task}
**Branch**: {branch name}
**PR**: {PR URL or "Not created"}

### Summary
- Planning: {planning sprint}
- Implementation: {impl sprints}
- Documentation: Updated
- PR: {Created/Draft/Skipped}

Ready for review and merge.
```

---

## Command Chain Summary

| Phase | Commands Used |
|-------|---------------|
| Planning | `/sprint-new` → `/plan-review` → `/sprint-complete` |
| Implementation | `/sprint-new` → `/code-review` → `/sprint-complete` (loop) |
| Documentation | `/docs-audit` |
| Completion | `/create-pr` (optional) |

All commands invoked via `Skill(skill: "command-name")`.

---

## Error Handling

### Plan Review Loops
If `/plan-review` returns `NEEDS_REVISION` 3+ times:
- Report to user
- Ask for guidance

### Code Review Loops
If `/code-review` returns `FIX_ALL_ISSUES` 3+ times:
- Report to user
- List remaining issues
- Ask whether to continue

### Blocked Tasks
If a task cannot be completed:
- Log to `Sprints/Logs/EXCEPTIONS-LOG.md`
- Mark task BLOCKED in SPRINT-LOG.md
- Continue with next task
- Report in final summary

---

## Key Principles

1. **Commands via Skill Tool**: Always use `Skill(skill: "name")` to invoke
2. **Single Source of Truth**: Each command file defines its behavior
3. **Quality Gates Block**: ALL issues must be fixed
4. **User Approval Required**: Never implement without approval
5. **You Do the Work**: Planning, implementing, fixing - not sub-agents

---

## Example Execution

```
User: "/task-execute add health check endpoint"

Pre-flight:
  ✓ Branch: feat/health-check (valid)
  ✓ No active sprint

Phase 1 - Planning:
  → Skill("sprint-new", "planning-health")
    Created: Sprint-health-01-planning
  → [Fill SPRINT-PLAN.md with 4 tasks]
  → Skill("plan-review")
    Result: APPROVED
  → [GATE 1] ExitPlanMode (user approves plan)
  → Skill("sprint-complete")

Phase 2 - Implementation:
  → Skill("sprint-new", "impl-health-1")
    Created: Sprint-health-02-impl
  → [Implement T001-T004]
  → Skill("code-review")
    Result: FIX_ALL_ISSUES (missing error handling)
  → [Fix the issue]
  → Skill("code-review")
    Result: APPROVED_COMPLETE
  → Skill("sprint-complete")
  → [GATE 2] AskUserQuestion (user approves implementation)

Phase 3 - Documentation:
  → Skill("docs-audit")
    Result: DOCS_GAPS_FOUND (CLAUDE.md needs update)
  → [Update CLAUDE.md]
  → Skill("docs-audit")
    Result: DOCS_COMPLETE

Phase 4 - Completion:
  → Summary generated
  → AskUserQuestion: "Create PR?"
    User: "Create PR"
  → Skill("create-pr")
    PR Created: https://github.com/org/repo/pull/129
  → Workflow complete
```

---

## Quick Reference

| What | How |
|------|-----|
| Create sprint | `Skill(skill: "sprint-new", args: "name")` |
| Complete sprint | `Skill(skill: "sprint-complete")` |
| Review plan | `Skill(skill: "plan-review")` |
| Review code | `Skill(skill: "code-review")` |
| Audit docs | `Skill(skill: "docs-audit")` |
| Create PR | `Skill(skill: "create-pr")` |
| User approval | `ExitPlanMode(...)` |
| Ask user | `AskUserQuestion(...)` |
