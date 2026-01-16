# Sprint Management Workflows

Detailed execution protocols for sprint management operations.

## Sprint Start Workflow

### Prerequisites
- Project has `Sprints/` directory
- Git repository initialized
- On a feature branch (recommended)

### Steps

1. **Context Recovery**
   ```
   Delegate to: context-recovery skill
   ```
   - Load project state
   - Identify active sprint for current branch
   - Get last task worked on

2. **Load Sprint Context**
   ```
   Read: Sprints/Active/{BRANCH_SHORT}/Sprint-{ID}/SPRINT-PLAN.md
   Read: Sprints/Active/{BRANCH_SHORT}/Sprint-{ID}/SPRINT-LOG.md
   ```
   - Extract task list
   - Identify completed tasks
   - Find next incomplete task

3. **Update Local State**
   ```yaml
   # Sprints/.sprint-state.local
   branch: {current_branch}
   branch_short: {branch_short}
   active_sprint: {sprint_name}
   sprint_path: {path}
   session_id: {new_id}
   deadlock_counter: 0
   last_task: {next_task_id}
   last_updated: {timestamp}
   ```

4. **Begin Execution**
   ```
   Delegate to: sprint-executor agent
   ```
   - Pass sprint context
   - Execute tasks autonomously
   - Return progress summary

---

## New Sprint Workflow

### Input Required
- Sprint name/description
- Sprint type (optional): implementation, research, architecture, bugfix, hotfix, documentation

### Steps

1. **Determine Naming**
   ```
   Branch: feat/user-auth
   Branch Short: user-auth
   Next Number: 01 (or increment from existing)
   Sprint ID: Sprint-user-auth-01-{name}
   ```

2. **Create Directory Structure**
   ```
   Sprints/Active/{BRANCH_SHORT}/Sprint-{ID}/
   ├── SPRINT-PLAN.md
   └── SPRINT-LOG.md
   ```

3. **Generate SPRINT-PLAN.md**
   ```markdown
   # Sprint: {Sprint ID}
   
   **Branch**: {branch}
   **Type**: {type}
   **Created**: {date}
   **Status**: Active
   
   ## Goals
   - {goal 1}
   - {goal 2}
   
   ## Success Criteria
   - [ ] {criterion 1}
   - [ ] {criterion 2}
   
   ## Tasks
   
   ### Setup Phase
   - [ ] T001: {task description}
   
   ### Implementation Phase
   - [ ] T002: {task description}
   - [ ] T003: {task description}
   
   ### Verification Phase
   - [ ] T004: Run tests
   - [ ] T005: Update documentation
   
   ## Dependencies
   - {dependency 1}
   
   ## Technical Notes
   - {note 1}
   
   ## Links
   - Previous: {link or N/A}
   - Next: TBD
   ```

4. **Generate SPRINT-LOG.md**
   ```markdown
   # Sprint Log: {Sprint ID}
   
   **Started**: {date}
   **Status**: Active
   
   ## Progress
   
   | Task | Status | Started | Completed |
   |------|--------|---------|-----------|
   | T001 | PENDING | - | - |
   
   ## Execution Log
   
   <!-- Task execution details will be logged here -->
   
   ## Autonomous Decisions
   
   <!-- Decisions made during execution -->
   
   ## Deadlock Tracking
   
   | Task | Attempts | Last Error | Status |
   |------|----------|------------|--------|
   
   ## Notes for Next Session
   
   <!-- Important context for continuation -->
   ```

5. **Update MASTER-SPRINT.md**
   - Add entry to Active Sprints table
   - Update Last Activity date

6. **Update SPRINT-INDEX.md**
   - Add entry with path and status

7. **Update Local State**
   - Set new sprint as active
   - Reset deadlock counter

8. **Auto-commit (if enabled)**
   ```bash
   git add Sprints/
   git commit -m "Sprint: Create {Sprint ID}"
   ```

---

## Sprint Status Workflow

### Steps

1. **Quick State Check**
   ```
   Read: Sprints/.sprint-state.local
   ```
   - Get active sprint
   - Get last task
   - Check deadlock counter

2. **Progress Analysis**
   ```
   Read: Active sprint's SPRINT-LOG.md
   ```
   - Count tasks by status
   - Calculate completion percentage
   - Identify blocked tasks

3. **Output Status Report**
   ```
   ## Sprint Status
   
   **Sprint**: {name}
   **Branch**: {branch}
   **Progress**: X/Y tasks (Z%)
   
   | Status | Count |
   |--------|-------|
   | Completed | X |
   | In Progress | Y |
   | Pending | Z |
   | Blocked | W |
   
   **Next Task**: {task_id} - {description}
   **Blockers**: {list or "None"}
   ```

---

## Sprint Complete Workflow

### Prerequisites
- All tasks completed or marked blocked
- Tests passing (if applicable)

### Steps

1. **Verify Completion**
   - Check all tasks have final status
   - Warn if tasks still pending

2. **Generate Completion Summary**
   ```markdown
   ## Sprint Completion Summary
   
   **Completed**: {date}
   **Duration**: {days} days
   
   ### Task Summary
   - Completed: X
   - Blocked: Y
   - Total: Z
   
   ### Key Accomplishments
   - {accomplishment 1}
   - {accomplishment 2}
   
   ### Blocked Items (Carry Forward)
   - {blocked task 1}
   
   ### Lessons Learned
   - {lesson 1}
   ```

3. **Update SPRINT-LOG.md**
   - Add completion summary
   - Mark status as Complete

4. **Archive Sprint**
   ```bash
   mv Sprints/Active/{BRANCH_SHORT}/Sprint-{ID} Sprints/Archive/
   ```

5. **Update MASTER-SPRINT.md**
   - Move from Active to Recent Completions
   - Update dates

6. **Link to Next Sprint**
   - If next sprint exists, update links
   - If not, note in completion summary

7. **Auto-commit (if enabled)**
   ```bash
   git add Sprints/
   git commit -m "Sprint: Complete {Sprint ID}"
   ```

8. **Clear Local State**
   - Remove active sprint from local state
   - Or set to next sprint if exists

---

## Autonomous Execution Rules

During sprint task execution:

### MUST
- Execute tasks without stopping to ask questions
- Make autonomous decisions and document them
- Follow existing codebase patterns
- Update SPRINT-LOG.md as tasks complete
- Log uncertainties but continue execution
- Update `.sprint-state.local` with progress

### MUST NOT
- Use AskUserQuestion tool during execution
- Stop to wait for clarification
- Request approval for implementation choices
- Present options and wait for selection
- End with questions

### Deadlock Protocol

If task fails 3 consecutive times:

1. Increment deadlock_counter in local state
2. Log in SPRINT-LOG.md under "Deadlock Tracking"
3. Create entry in EXCEPTIONS-LOG.md:
   ```markdown
   ## Exception: {date} - {task_id}
   
   **Type**: DL001 (Task Deadlock)
   **Sprint**: {sprint_id}
   **Task**: {task_id} - {description}
   
   **Attempts**: 3
   **Last Error**: {error description}
   
   **Status**: BLOCKED
   **Action Required**: Human review
   ```
4. Mark task as BLOCKED (not failed)
5. Continue to next task
6. NEVER stop entire workflow for single task
