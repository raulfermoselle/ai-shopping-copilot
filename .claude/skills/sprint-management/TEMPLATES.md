# Sprint Templates

Templates for creating sprint artifacts.

## Sprint Types

| Type | Prefix | Use Case |
|------|--------|----------|
| Implementation | I | Building new features |
| Research | R | Investigation, analysis |
| Architecture | A | Design, structure decisions |
| Bugfix | B | Fixing issues |
| Hotfix | H | Urgent production fixes |
| Documentation | D | Docs, guides, READMEs |

## SPRINT-PLAN.md Template

```markdown
# Sprint: {SPRINT_ID}

**Branch**: {BRANCH}
**Type**: {TYPE}
**Created**: {DATE}
**Status**: Active

## Goals

Primary objectives for this sprint:

1. {Primary goal}
2. {Secondary goal}

## Success Criteria

Definition of done:

- [ ] {Criterion 1}
- [ ] {Criterion 2}
- [ ] All tests passing
- [ ] Documentation updated

## Tasks

Maximum 5-7 tasks per sprint (AI context aware).

### Setup Phase
- [ ] T001: {Setup task}

### Implementation Phase  
- [ ] T002: {Implementation task}
- [ ] T003: {Implementation task}
- [ ] T004: {Implementation task}

### Verification Phase
- [ ] T005: Run all tests
- [ ] T006: Update documentation
- [ ] T007: Code review / self-review

## Dependencies

External dependencies or blockers:

- {Dependency 1}
- {Dependency 2}

## Technical Notes

Important technical context:

- {Note 1}
- {Note 2}

## Links

- **Previous Sprint**: {Link or N/A}
- **Next Sprint**: TBD
- **Related Specs**: {Links}
- **Related Issues**: {Links}

---

## Metadata

```yaml
sprint:
  id: "{SPRINT_ID}"
  branch: "{BRANCH}"
  type: "{TYPE}"
  created: "{DATE}"
  status: "active"
  tasks_total: 7
  tasks_completed: 0
```
```

## SPRINT-LOG.md Template

```markdown
# Sprint Log: {SPRINT_ID}

**Started**: {DATE}
**Status**: Active
**Last Updated**: {DATE}

## Progress Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 0 |
| In Progress | 0 |
| Blocked | 0 |
| Remaining | 7 |

## Task Progress

| Task | Description | Status | Started | Completed |
|------|-------------|--------|---------|-----------|
| T001 | {desc} | PENDING | - | - |
| T002 | {desc} | PENDING | - | - |
| T003 | {desc} | PENDING | - | - |
| T004 | {desc} | PENDING | - | - |
| T005 | {desc} | PENDING | - | - |
| T006 | {desc} | PENDING | - | - |
| T007 | {desc} | PENDING | - | - |

## Execution Log

### {DATE} - Session Start

**Session ID**: {SESSION_ID}
**Starting Task**: T001

---

<!-- Task execution entries will be added here -->

### Task T001: {Description}

**Status**: IN_PROGRESS → COMPLETED
**Started**: {TIMESTAMP}
**Completed**: {TIMESTAMP}

**Implementation**:
- {What was done}
- {Files created/modified}

**Decisions Made**:
- {Decision 1}: {Rationale}

**Files Modified**:
- `path/to/file.ts` (created)
- `path/to/other.ts` (modified)

---

## Autonomous Decisions

Decisions made during autonomous execution:

| Decision | Rationale | Task |
|----------|-----------|------|
| {Decision} | {Why} | T001 |

## Deadlock Tracking

| Task | Attempts | Last Error | Resolution |
|------|----------|------------|------------|
| - | - | - | - |

## Notes for Next Session

Important context for the next session:

- {Context item 1}
- {Context item 2}

## Completion Summary

<!-- Filled when sprint completes -->

**Completed**: {DATE}
**Duration**: {X} days

### Accomplishments
- {Accomplishment 1}

### Carried Forward
- {Blocked items}

### Lessons Learned
- {Lesson 1}
```

## Commit Message Templates

### Sprint Creation
```
Sprint: Create {SPRINT_ID}

- Initialize sprint structure
- Add SPRINT-PLAN.md with {N} tasks
- Update MASTER-SPRINT.md

Branch: {BRANCH}
```

### Task Completion
```
Sprint [{BRANCH_SHORT}-{NUM}]: {Summary}

Tasks completed:
- {Task 1}
- {Task 2}

Status: {Complete/Partial} ({X}/{Y} tasks)
Next: {Next task or "Sprint complete"}
```

### Sprint Completion
```
Sprint: Complete {SPRINT_ID}

Summary:
- Completed: {X} tasks
- Blocked: {Y} tasks
- Duration: {Z} days

Key accomplishments:
- {Accomplishment 1}
- {Accomplishment 2}
```

## Directory Structure

```
Sprints/
├── Active/
│   └── {BRANCH_SHORT}/
│       └── Sprint-{BRANCH_SHORT}-{NUM}-{NAME}/
│           ├── SPRINT-PLAN.md
│           └── SPRINT-LOG.md
├── Archive/
│   └── Sprint-{ID}/
│       ├── SPRINT-PLAN.md
│       └── SPRINT-LOG.md
├── Logs/
│   ├── sessions/
│   │   └── {DATE}-{BRANCH}-{SESSION}.md
│   ├── MASTER-LOG.md
│   ├── EXCEPTIONS-LOG.md
│   └── LESSONS-LEARNED.md
├── MASTER-SPRINT.md
├── SPRINT-INDEX.md
├── SPRINT-PLANNING.md
└── sprint.config.yaml
```
