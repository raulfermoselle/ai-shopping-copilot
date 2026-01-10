---
description: Show current sprint management status
---

# Sprint Status

Display the current state of sprint management including active sprint, recent completions, and any blockers.

## Usage

```
/sprint-status
```

---

## Information to Display

### 1. Read MASTER-SPRINT.md

Extract and display:

**Project Overview**
| Field | Value |
|-------|-------|
| Last Updated | [date] |
| Project Version | [version] |
| Overall Status | [status] |
| Deadlock Counter | [count] |

### 2. Active Sprint

Show current sprint details:
- Sprint ID and name
- Status (Planning/Active/Blocked)
- Focus area
- Link to sprint plan

### 3. Recent Completions

List last 5 completed sprints:
| Date | Sprint | Summary |
|------|--------|---------|
| ... | ... | ... |

### 4. Sprint Queue

Show upcoming work:
- **Priority 1**: [Current focus]
- **Priority 2**: [Next up]
- **Backlog**: [Count] items

### 5. Blockers & Exceptions

If any exist, show:
- Blocked sprints with reasons
- Active exceptions from EXCEPTIONS-LOG.md

---

## Output Format

```
======================================================
  Sprint Management Status
======================================================

  Last Updated:    YYYY-MM-DD
  Project Version: X.Y.Z
  Overall Status:  [In Progress / Blocked / Idle]
  Deadlock Count:  0

------------------------------------------------------
  Active Sprint
------------------------------------------------------
  Sprint-XX-name: [Focus]
    Status: IN_PROGRESS
    Tasks: X/Y completed
    Link: Sprints/Active/Sprint-XX-name/

------------------------------------------------------
  Recent Completions (Last 5)
------------------------------------------------------
  [YYYY-MM-DD] Sprint-XX: Summary
  [YYYY-MM-DD] Sprint-XX: Summary

------------------------------------------------------
  Queue
------------------------------------------------------
  Priority 1: Sprint-XX - [Focus]
  Priority 2: Sprint-XX - [Focus]
  Backlog: X items

======================================================
```

---

## Quick Actions

After showing status, suggest relevant next steps:

- If no active sprint: "Create a sprint with /sprint-new"
- If sprint active: "Continue with /sprint-start"
- If blockers exist: "Review EXCEPTIONS-LOG.md for blockers"
- If sprint almost done: "Complete with /sprint-complete"
