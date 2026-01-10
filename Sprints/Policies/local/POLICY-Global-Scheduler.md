# Global Scheduler Policy

<!-- LOCK_STATUS: MICHELIN -->
<!-- LOCK_REASON: Core orchestration logic - human oversight required -->

## Overview

The Global Scheduler orchestrates sprint execution across all project components, manages context resets, handles deadlocks, and ensures continuous progress.

### Concurrent Mode Operation

When `concurrency.enabled: true`, the scheduler operates **per-branch**:

1. **Branch Scope**: Each Git branch has independent sprint execution
2. **Local State**: Read `.sprint-state.local` first for branch-specific context
3. **No Cross-Branch**: Never modify another branch's sprint state
4. **Parallel Execution**: Multiple developers can run sprints simultaneously on different branches
5. **Merge Awareness**: After branch merge, update SPRINT-INDEX.md "Merged To" column

---

## Autonomous Execution Rule

**CRITICAL: The AI must NEVER ask questions or wait for user input during sprint execution.**

### Core Principle

Sprint execution must be fully autonomous. The CLI must not stop and wait for user answers.

### Decision Making Protocol

When facing uncertainty during sprint execution:

1. **Consult Policies First** - Check existing policies for guidance
2. **Use Best Judgment** - Make a reasonable decision based on:
   - Project patterns and conventions
   - Industry best practices
   - Existing codebase examples
3. **Document the Decision** - Log in SPRINT-LOG.md:
   ```markdown
   ### Autonomous Decision - [Task ID]
   **Context**: [What was uncertain]
   **Decision**: [What was decided]
   **Rationale**: [Why this choice]
   ```
4. **Continue Execution** - Never stop to ask

### Prohibited Actions During Sprint

- Using AskUserQuestion tool
- Stopping execution to wait for clarification
- Requesting approval for implementation choices
- Asking "should I..." or "would you like..." questions
- Presenting options and waiting for user selection
- Ending a sprint summary with questions or choices

### Allowed Actions

- Making autonomous decisions and documenting them
- Logging uncertainties in SPRINT-LOG.md for later review
- Following existing patterns in the codebase
- Creating EXCEPTIONS-LOG entries for true blockers (after 3 attempts)

---

## Scheduler Workflow

```
+-------------------------------------------------------------+
|                   GLOBAL SCHEDULER LOOP                      |
+-------------------------------------------------------------+
|                                                              |
|  1. READ README.md                                           |
|     |                                                        |
|     v                                                        |
|  2. READ MASTER-SPRINT.md -> Get current state               |
|     |                                                        |
|     v                                                        |
|  3. IDENTIFY active sprint                                   |
|     |                                                        |
|     v                                                        |
|  4. EXECUTE sprint tasks (autonomous)                        |
|     |                                                        |
|     v                                                        |
|  5. UPDATE SPRINT-LOG.md with progress                       |
|     |                                                        |
|     v                                                        |
|  6. SPRINT COMPLETE?                                         |
|     |                                                        |
|     +--YES-> 7. COMMIT & PUSH                                |
|     |           |                                            |
|     |           v                                            |
|     |        8. UPDATE MASTER-SPRINT.md                      |
|     |           |                                            |
|     |           v                                            |
|     |        9. RUN /clear                                   |
|     |           |                                            |
|     |           v                                            |
|     |        10. GOTO Step 1 (next sprint)                   |
|     |                                                        |
|     +--NO--> Check for DEADLOCK                              |
|                 |                                            |
|                 +--PROGRESS-> Continue sprint                |
|                 |                                            |
|                 +--STUCK-> Log exception, continue           |
|                                                              |
+-------------------------------------------------------------+
```

---

## Deadlock Detection and Handling

### Detection Criteria

A deadlock is detected when:
- **Same task attempted 3+ times** without progress
- **No file changes** across 3 consecutive attempts
- **Same error repeated** 3+ times
- **Context exhaustion** before task completion (3 resets on same task)

### Deadlock Tracking

In SPRINT-LOG.md, track attempts:

```markdown
## Deadlock Tracking

| Task ID | Attempts | Last Attempt | Status |
|---------|----------|--------------|--------|
| T001    | 1        | 2025-12-19   | OK     |
| T002    | 3        | 2025-12-19   | STUCK  |
```

### Deadlock Response Protocol

When deadlock detected:

1. **Log the exception** in SPRINT-LOG.md
2. **Mark task as BLOCKED** (not failed)
3. **Create exception entry** in EXCEPTIONS-LOG.md
4. **Move to next task** or next sprint
5. **Continue execution** - don't stop the entire workflow

### Exception Entry Format

```markdown
### DEADLOCK EXCEPTION - [TASK_ID]

**Detected**: YYYY-MM-DD HH:MM
**Task**: [Task description]
**Attempts**: [X]
**Last Error**: [Error message or description]

**Symptoms**:
- [ ] Same error repeated
- [ ] No file changes
- [ ] Context exhausted

**AI Analysis**:
[AI's assessment of why progress cannot be made]

**Recommended Human Action**:
1. [Suggested action 1]
2. [Suggested action 2]

**Resolution Status**: PENDING_HUMAN_REVIEW
```

---

## Sprint Transition Rule

When a sprint completes, **immediately begin the next sprint** from the priority queue.

Do NOT:
- Present "next sprint options" to the user
- Ask which sprint to work on next
- Wait for confirmation to proceed

Simply state the completed sprint summary and continue execution.

---

## Commit & Push Protocol

### After Every Sprint Completion

```bash
git add .
git commit -m "Sprint [XX]: [Summary]

Tasks completed:
- [Task 1]
- [Task 2]

Status: [Complete/Partial]
Next: [Next sprint or action]"

git push origin main
```

### Partial Sprint Commits

If sprint not fully complete but progress made:

```bash
git commit -m "WIP Sprint [XX]: [Summary]

Completed:
- [Task 1]

Blocked:
- [Task 2]: [Reason]

See SPRINT-LOG.md for details"
```

---

## Exception Categories

| Code | Category | Auto-Action | Human Required |
|------|----------|-------------|----------------|
| DL001 | Task deadlock | Skip task, log | Review needed |
| DL002 | Sprint deadlock | Skip sprint, log | Review needed |
| CTX001 | Context exhausted | Reset, retry | If 3x fails |
| API001 | API unavailable | Retry later | If persistent |
| AUTH001 | Auth failure | Skip platform | Credentials needed |
| NET001 | Network error | Retry 3x | If persistent |

---

## Related Policies

- [POLICY-AI-Context-Management.md](./POLICY-AI-Context-Management.md) - Context handling
- [POLICY-Vibe-Sprint.md](./POLICY-Vibe-Sprint.md) - Sprint rules

---

*Version 2.0 - Part of Sprint Management Framework*
