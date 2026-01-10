# Sprint Framework Guide

> Complete reference for AI assistants and developers managing sprints in this project.

**Project**: AI Shopping Copilot
**Prefix**: AISC
**Mode**: multi-module

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Framework Overview](#framework-overview)
3. [Directory Structure](#directory-structure)
4. [Sprint Lifecycle](#sprint-lifecycle)
5. [Claude Commands](#claude-commands)
6. [AI Execution Rules](#ai-execution-rules)
7. [Context Recovery](#context-recovery)
8. [Configuration Reference](#configuration-reference)
9. [Simple Mode Guide](#simple-mode-guide)
10. [Multi-Module Mode Guide](#multi-module-mode-guide)
11. [Concurrent Sprint Guide](#concurrent-sprint-guide)
12. [Troubleshooting](#troubleshooting)

---

## Quick Reference

### Key Files (Read These First)

| File | Purpose | When to Read |
|------|---------|--------------|
| `MASTER-SPRINT.md` | Orchestration hub, current state | **Always first** after /clear |
| `SPRINT-INDEX.md` | Sprint lookup table | Finding specific sprints |
| `SPRINT-PLANNING.md` | Master task roadmap | Planning work |
| `sprint.config.yaml` | Project configuration | Understanding settings |

### Essential Commands

| Command | When to Use |
|---------|-------------|
| `/sprint-start` | Begin work on active sprint |
| `/sprint-complete` | Finish current sprint |
| `/sprint-status` | Check current state |
| `/sprint-new` | Create new sprint |
| `/context-recovery` | Recover after /clear |

---

## Framework Overview

### Purpose

This framework enables structured AI-assisted development through:
- **Context Persistence**: Recover state after /clear or session restart
- **Autonomous Execution**: AI works independently without stopping for questions
- **Progress Tracking**: Clear documentation of what's done and what's next
- **Deadlock Handling**: Systematic approach to blockers

### Core Principles

1. **Single Root Directory**: Everything lives in `Sprints/`
2. **MASTER-SPRINT.md is Truth**: Always the authoritative source of current state
3. **Small Sprints**: 5-7 tasks maximum for AI context limits
4. **Document Everything**: Decisions, progress, and blockers

---

## Directory Structure

### Simple Mode

```
Sprints/
├── sprint.config.yaml          # Configuration
├── MASTER-SPRINT.md            # Orchestration hub (READ FIRST!)
├── SPRINT-INDEX.md             # Sprint lookup
├── SPRINT-PLANNING.md          # Master task list
├── SPRINT-FRAMEWORK-GUIDE.md   # This guide
├── README.md                   # Directory overview
│
├── Policies/
│   ├── local/                  # Project-specific policies
│   │   ├── POLICY-AI-Context-Management.md
│   │   ├── POLICY-Vibe-Sprint.md
│   │   └── POLICY-Global-Scheduler.md
│   ├── linked/                 # Synced from external repo
│   ├── generated/              # After variable substitution
│   └── policy-manifest.yaml    # Enable/disable control
│
├── Logs/
│   ├── MASTER-LOG.md           # AI session history
│   ├── EXCEPTIONS-LOG.md       # Deadlock/error tracking
│   └── LESSONS-LEARNED.md      # Continuous improvement
│
└── Active/
    └── Sprint-XX-name/
        ├── SPRINT-PLAN.md      # Sprint details and tasks
        └── SPRINT-LOG.md       # Execution log
```

### Multi-Module Mode

```
Sprints/
├── (same config and log files)
├── Global/                     # Infrastructure sprints
│   └── Sprint-G-XXX/
└── Modules/
    ├── ModuleA/
    │   ├── Sprint-R-001/       # Research
    │   ├── Sprint-A-001/       # Architecture
    │   ├── Sprint-I-001/       # Implementation
    │   └── Sprint-D-001/       # Documentation
    └── ModuleB/
        └── ...
```

---

## Sprint Lifecycle

### 1. Sprint Creation

```bash
# Simple mode
python scripts/new_sprint.py --number 01 --name "setup"

# Multi-module mode
python scripts/new_sprint.py --module LinkedIn --type research --number 001 --name "api-research"
```

### 2. Sprint Execution

1. AI reads `MASTER-SPRINT.md` to understand current state
2. AI reads the sprint's `SPRINT-PLAN.md` for tasks
3. AI executes tasks autonomously
4. AI updates `SPRINT-LOG.md` as tasks complete
5. If blocked, AI logs to `EXCEPTIONS-LOG.md` and continues

### 3. Sprint Completion

1. All tasks marked complete in `SPRINT-LOG.md`
2. `MASTER-SPRINT.md` updated with completion status
3. Changes committed with standard format
4. `/clear` executed to reset context
5. Next sprint begins

### Sprint States

| State | Meaning |
|-------|---------|
| `Planned` | Created but not started |
| `In Progress` | Currently being worked on |
| `Blocked` | Waiting on external dependency |
| `Completed` | All tasks done |
| `Abandoned` | Cancelled (with reason documented) |

---

## Claude Commands

### /sprint-start

**Purpose**: Begin work on the active sprint with full context recovery.

**What it does**:
1. Reads `MASTER-SPRINT.md` for current state
2. Reads active sprint's `SPRINT-PLAN.md`
3. Checks `SPRINT-LOG.md` for progress
4. Reads enabled policies
5. Begins autonomous execution

**Use when**: Starting a new session or after /clear

### /sprint-complete

**Purpose**: Complete the current sprint and prepare for transition.

**What it does**:
1. Verifies all tasks are complete
2. Updates `SPRINT-LOG.md` with final status
3. Updates `MASTER-SPRINT.md`
4. Creates commit with standard format
5. Prepares for context reset

**Use when**: All sprint tasks are done

### /sprint-status

**Purpose**: Show current sprint management status.

**What it does**:
1. Reads `MASTER-SPRINT.md`
2. Summarizes active sprint and tasks
3. Shows recent completions
4. Lists any blockers

**Use when**: Need quick status check

### /sprint-new

**Purpose**: Create a new sprint interactively.

**What it does**:
1. Prompts for sprint details
2. Runs `new_sprint.py` script
3. Creates sprint directory and files
4. Updates `SPRINT-INDEX.md`

**Use when**: Ready to plan next sprint

### /context-recovery

**Purpose**: Full context recovery after /clear or session restart.

**What it does**:
1. Systematic file reading sequence
2. Rebuilds understanding of project state
3. Identifies current work item
4. Resumes from last known state

**Use when**: After /clear, session timeout, or context loss

---

## AI Execution Rules

### Autonomous Execution

During sprint execution, AI should:

1. **Execute Without Asking**: Don't stop to ask permission for standard operations
2. **Make Reasonable Decisions**: Choose sensible defaults when details are unspecified
3. **Document Decisions**: Log choices in `SPRINT-LOG.md`
4. **Keep Moving**: Don't block on minor uncertainties

### The 3-Strike Rule (Deadlock Handling)

If an AI encounters the same blocker 3 times:

1. **Strike 1**: Try alternative approach
2. **Strike 2**: Try second alternative
3. **Strike 3**: Log to `EXCEPTIONS-LOG.md` and move to next task

```markdown
## Exception Entry Format

### [DATE] - [SPRINT-ID] - [TASK]
- **Issue**: What went wrong
- **Attempts**: What was tried (3 attempts)
- **Resolution**: Skipped / Escalated / Workaround
- **Action Required**: What human needs to do
```

### Task Completion Logging

Update `SPRINT-LOG.md` after each task:

```markdown
## Task Log

### [DATE TIME] - Task 1: [Name]
- **Status**: Completed
- **Actions**: What was done
- **Files**: Modified files
- **Notes**: Any relevant observations
```

---

## Context Recovery

### After /clear or Session Restart

Execute this sequence:

1. **Read MASTER-SPRINT.md** - Understand current state
2. **Read Active Sprint's SPRINT-PLAN.md** - Get task list
3. **Read Active Sprint's SPRINT-LOG.md** - See what's done
4. **Read sprint.config.yaml** - Understand settings
5. **Read Enabled Policies** - Know the rules
6. **Resume from last incomplete task**

### Recovery Checklist

```markdown
[ ] Read Sprints/MASTER-SPRINT.md
[ ] Identify active sprint
[ ] Read active sprint's SPRINT-PLAN.md
[ ] Read active sprint's SPRINT-LOG.md
[ ] Identify last completed task
[ ] Identify next task to execute
[ ] Read relevant policies from Policies/local/
[ ] Resume execution
```

---

## Configuration Reference

### sprint.config.yaml

```yaml
version: "1.0"

project:
  name: "Project Name"      # Full project name
  prefix: "PROJ"            # Short code (2-6 chars)

mode: simple                # simple | multi-module

policies:
  local_path: "Policies/local/"
  linked_path: "Policies/linked/"
  generated_path: "Policies/generated/"
  external_repo: ""         # Optional external policy repo
  manifest: "Policies/policy-manifest.yaml"

naming:
  simple:
    pattern: "Sprint-{NUMBER:02d}-{NAME}"
  multi:
    global_prefix: "G"
    pattern: "Sprint-{TYPE}-{NUMBER:03d}"

ai:
  max_tasks_per_sprint: 7   # Keep sprints small
  context_reset_after_sprint: true
  autonomous_execution: true
  deadlock_threshold: 3     # Strikes before moving on

modules: []                 # For multi-module mode

variables:
  PROJECT_PREFIX: "PROJ"
  PROJECT_NAME: "Project Name"
```

### AI Settings Explained

| Setting | Purpose | Recommended |
|---------|---------|-------------|
| `max_tasks_per_sprint` | Limits sprint size for AI context | 5-7 |
| `context_reset_after_sprint` | /clear after each sprint | true |
| `autonomous_execution` | Execute without asking | true |
| `deadlock_threshold` | Attempts before giving up | 3 |

---

## Simple Mode Guide

### When to Use

- Single-focus projects
- MVPs and prototypes
- Straightforward development
- Solo developers

### Sprint Naming

Pattern: `Sprint-{NUMBER:02d}-{NAME}`

Examples:
- Sprint-01-setup
- Sprint-02-authentication
- Sprint-03-api-endpoints

### Workflow

1. **Plan**: Add tasks to `SPRINT-PLANNING.md`
2. **Create**: Run `/sprint-new` or `new_sprint.py`
3. **Execute**: Run `/sprint-start`
4. **Complete**: Run `/sprint-complete`
5. **Repeat**: Start next sprint

### Example Sprint Structure

```
Active/
└── Sprint-01-setup/
    ├── SPRINT-PLAN.md      # 5-7 specific tasks
    └── SPRINT-LOG.md       # Execution history
```

---

## Multi-Module Mode Guide

### When to Use

- Complex multi-platform projects
- Parallel development workstreams
- Projects with distinct components
- Team environments

### Sprint Types

| Type | Prefix | Purpose | Produces Code? |
|------|--------|---------|----------------|
| Research | R | API discovery, documentation review | No |
| Architecture | A | Design, planning, specs | No |
| Implementation | I | Coding, features, fixes | Yes |
| Documentation | D | Docs, examples, guides | No |
| Bug Fix | B | Defect resolution | Yes |
| Hotfix | H | Emergency patches | Yes |
| Global | G | Infrastructure, shared utilities | Yes |

### Phase Sequence

Each module follows:
```
R-001 (Research) → A-001 (Architecture) → I-001..N (Implementation) → D-001 (Documentation)
```

### Sprint Naming

Pattern: `Sprint-{TYPE}-{NUMBER:03d}`

Examples:
- Sprint-R-001 (Research)
- Sprint-A-001 (Architecture)
- Sprint-I-001 (Implementation)
- Sprint-G-001 (Global infrastructure)

### Module Configuration

```yaml
modules:
  - name: "LinkedIn"
    prefix: "L"
    path: "Modules/LinkedIn/"
  - name: "Discord"
    prefix: "DC"
    path: "Modules/Discord/"
```

---

## Concurrent Sprint Guide

### Overview

Concurrent sprint management enables multiple developers to work on sprints simultaneously from separate Git branches without merge conflicts.

### When to Use

- Multiple team members working in parallel
- Feature branches with isolated sprint work
- Avoiding merge conflicts in sprint tracking files

### Branch-Based Sprint Naming

**Pattern**: `Sprint-{BRANCH_SHORT}-{NUMBER:02d}-{NAME}`

**Branch name transformation:**
```
feat/user-authentication  →  Sprint-user-auth-01-login-flow
fix/bug-123-login         →  Sprint-bug-123-01-fix
feature/api-v2            →  Sprint-api-v2-01-endpoints
develop                   →  Sprint-dev-01-feature-name
main                      →  Sprint-main-01-hotfix-name
```

**Transformation rules:**
1. Strip common prefixes: `feat/`, `feature/`, `fix/`, `bugfix/`, `hotfix/`, `chore/`
2. Take meaningful segments
3. Truncate to ~20 chars max
4. Append sequential number + descriptive name

### Directory Structure

```
Active/
├── user-auth/                         # Branch namespace
│   ├── Sprint-user-auth-01-models/
│   │   ├── SPRINT-PLAN.md
│   │   └── SPRINT-LOG.md
│   └── Sprint-user-auth-02-api/
├── api-v2/
│   └── Sprint-api-v2-01-endpoints/
└── bug-123/
    └── Sprint-bug-123-01-fix/
```

### Local State File

Each developer has a local state file: `.sprint-state.local` (gitignored)

```yaml
# Auto-generated by sprint tools - do not edit manually
branch: feat/user-auth
branch_short: user-auth
active_sprint: Sprint-user-auth-01-login
session_id: abc123
deadlock_counter: 0
last_task: T003
last_updated: 2026-01-06T10:30:00Z
```

### Concurrent Workflow

#### Developer A: Starting Work on Feature Branch

```bash
# 1. Create and checkout feature branch
git checkout -b feat/user-auth

# 2. Create sprint (auto-detects branch)
/sprint-new
# → Creates: Active/user-auth/Sprint-user-auth-01-{NAME}/
# → Updates: .sprint-state.local
# → Appends: SPRINT-INDEX.md

# 3. Start working
/sprint-start
# → Reads .sprint-state.local
# → Loads Sprint-user-auth-01 context

# 4. Complete sprint
/sprint-complete
# → Updates sprint status
# → Commits changes
```

#### Developer B: Working Simultaneously

```bash
# Same time, different branch
git checkout -b feat/api-v2

/sprint-new
# → Creates: Active/api-v2/Sprint-api-v2-01-{NAME}/
# → No conflicts with Developer A
```

#### Merging Back to Main

```bash
# Developer A merges
git checkout main
git merge feat/user-auth

# Post-merge: Sprint marked "Merged To: main" in SPRINT-INDEX.md
# Optional: Move Active/user-auth/ → Archive/user-auth/
```

### Session-Based Logging

Session logs avoid merge conflicts:
```
Logs/sessions/
├── 2026-01-06-user-auth-abc123.md
├── 2026-01-06-api-v2-def456.md
└── ...
```

**Naming pattern**: `{DATE}-{BRANCH_SHORT}-{SESSION_ID:6}.md`

### Edge Cases

#### Multiple Sprints on Same Branch

Sequential numbering within branch namespace:
```
Active/user-auth/
├── Sprint-user-auth-01-models/    # Completed
├── Sprint-user-auth-02-api/       # Completed
└── Sprint-user-auth-03-frontend/  # Active
```

#### Multiple Developers on Same Branch

For small teams, this is uncommon. Handling options:
1. **Coordinate verbally** - one active sprint at a time on shared branch
2. **Sub-branches** - each dev creates sub-branch: `feat/user-auth-bob`
3. **Sequential sprints** - take turns, don't run concurrent sprints on same branch

#### Long-Running Branches (develop)

Sprints on `develop` use pattern: `Sprint-dev-{NUMBER:02d}-{NAME}`
- Archive completed sprints periodically
- Keep `develop` sprint count manageable

---

## Troubleshooting

### Common Issues

#### "I don't know what to do next"

1. Read `MASTER-SPRINT.md`
2. Find the active sprint
3. Read that sprint's `SPRINT-PLAN.md`
4. Check `SPRINT-LOG.md` for last completed task
5. Execute next incomplete task

#### "Sprint seems stuck"

1. Check `EXCEPTIONS-LOG.md` for logged blockers
2. Review the 3-strike rule - has it been applied?
3. Consider splitting the blocking task
4. Document in `LESSONS-LEARNED.md`

#### "Context is lost after /clear"

Run `/context-recovery` or manually:
1. Read `MASTER-SPRINT.md`
2. Read active sprint files
3. Read relevant policies
4. Resume from last known state

#### "Not sure which sprint type to use"

- **Research**: You're learning about APIs or systems
- **Architecture**: You're designing, not coding
- **Implementation**: You're writing code
- **Documentation**: You're writing docs

### Getting Help

If stuck:
1. Check this guide
2. Review policies in `Policies/local/`
3. Check `LESSONS-LEARNED.md` for past solutions
4. Log the issue in `EXCEPTIONS-LOG.md`

---

## Appendix: Commit Message Format

```
[SPRINT-ID] Brief description

- Detail 1
- Detail 2

Sprint: Sprint-XX-name
Status: In Progress | Completed
```

Example:
```
[Sprint-01] Add user authentication

- Implemented login/logout endpoints
- Added JWT token generation
- Created auth middleware

Sprint: Sprint-01-authentication
Status: Completed
```

---

*This guide is automatically copied during Sprint Management installation.*
*Framework: https://github.com/github-joyngroup/SprintManagement*
