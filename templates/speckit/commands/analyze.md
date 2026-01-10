---
description: Analyze spec/plan/tasks for consistency (Sprint-Speckit Integration)
---

# /speckit.analyze - Consistency Analysis

This command performs read-only cross-artifact consistency analysis to identify issues before or after implementation.

## Usage

```
/speckit.analyze [feature-id]
```

**Example**:
```
/speckit.analyze 001-user-auth
```

---

## Purpose

Analyze alignment between:
- `spec.md` - Feature specification
- `plan.md` - Implementation plan
- `tasks.md` - Task breakdown
- `memory/constitution.md` - Project principles

**Key Constraint**: This is a READ-ONLY command. It reports issues but never modifies files.

---

## When to Run

| Timing | Purpose |
|--------|---------|
| After `/speckit.tasks` | Validate before sprint creation |
| During sprint | Check mid-implementation alignment |
| Before `/sprint-complete` | Final consistency check |
| After scope changes | Re-validate alignment |

---

## Analysis Workflow

### Step 1: Load Artifacts

From `Sprints/Specs/[feature-id]/`:
- `spec.md` (required)
- `plan.md` (required)
- `tasks.md` (required)

From project root:
- `memory/constitution.md`

If any file missing: ABORT with clear error.

### Step 2: Build Semantic Models

**Requirements Inventory**:
```
REQ-001: [requirement text] → US1, US2
REQ-002: [requirement text] → US1
```

**Task Mapping**:
```
T001 → SETUP (no requirement)
T008 → REQ-001
T010 → REQ-002
```

### Step 3: Run Detection Passes

#### 3.1 Duplication Detection
- Near-identical requirements
- Overlapping tasks
- Consolidation candidates

#### 3.2 Ambiguity Detection
- Vague terms without metrics ("fast", "many", "easy")
- Unresolved placeholders (TODO, ???, [NEEDS CLARIFICATION])
- Missing acceptance criteria

#### 3.3 Underspecification Detection
- Requirements without tasks
- Tasks without clear outcomes
- Missing error handling

#### 3.4 Constitution Alignment
- Violations of project principles
- Missing test-first adherence
- Simplicity violations

#### 3.5 Coverage Analysis
- Requirements with zero tasks
- Tasks not traced to requirements
- User stories without implementation

#### 3.6 Inconsistency Detection
- Terminology drift (different names for same thing)
- Data model conflicts
- Task ordering contradictions

### Step 4: Severity Assignment

| Severity | Criteria | Action |
|----------|----------|--------|
| CRITICAL | Constitution violation, zero coverage on P1 | Must fix before implementation |
| HIGH | Conflicts, untestable criteria | Should fix before sprint end |
| MEDIUM | Ambiguity, minor gaps | Address when convenient |
| LOW | Style, minor inconsistency | Optional fix |

### Step 5: Generate Report

Structured markdown report with:
- Findings table (max 50 items)
- Coverage metrics
- Severity summary
- Recommended actions

---

## Constitution Checks

Validate against each article:

| Article | Check |
|---------|-------|
| I. Sprint-First | Tasks fit sprint capacity |
| II. Spec-Driven | Tasks trace to spec |
| III. Test-First | Test tasks precede implementation |
| IV. Autonomous | No blocking questions in plan |
| V. Context Recovery | Handoff notes present |
| VI. Simplicity | No over-engineering |
| VII. Integration-First | Real dependencies in tests |
| VIII. Library-First | Modular design |
| IX. Documentation | Artifacts up to date |
| X. Deadlock | Resolution path defined |

---

## Output Format

```
## Analysis Report: [feature-id]

**Generated**: [timestamp]
**Artifacts**: spec.md, plan.md, tasks.md

### Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 3 |
| **Total** | **10** |

### Coverage Metrics
| Metric | Value |
|--------|-------|
| Requirements | 12 |
| Tasks | 27 |
| Coverage | 92% |
| Unmapped Reqs | 1 |
| Orphan Tasks | 2 |

### Findings

| ID | Severity | Category | Location | Issue |
|----|----------|----------|----------|-------|
| A001 | HIGH | Coverage | REQ-005 | No tasks for "password reset" |
| A002 | HIGH | Constitution | T008-T010 | Tests not before implementation |
| A003 | MEDIUM | Ambiguity | spec.md:45 | "fast response" undefined |
| A004 | MEDIUM | Duplication | REQ-003, REQ-007 | Similar requirements |
| A005 | LOW | Terminology | plan.md, tasks.md | "user" vs "account" |

### Constitution Alignment
| Article | Status | Notes |
|---------|--------|-------|
| III. Test-First | VIOLATION | T008-T010 ordering |
| VI. Simplicity | PASS | |
| (others) | PASS | |

### Recommended Actions

**Immediate (CRITICAL/HIGH)**:
1. Add tasks for REQ-005 (password reset)
2. Reorder tasks: T008 tests before T010 implementation

**Suggested (MEDIUM)**:
3. Define "fast response" metric in spec
4. Consolidate REQ-003 and REQ-007

**Optional (LOW)**:
5. Standardize terminology

### Next Steps
- Fix CRITICAL/HIGH issues before proceeding
- Run `/speckit.analyze` again after fixes
- If clean, proceed with `/speckit.implement`
```

---

## Sprint Integration

### Pre-Sprint Check
```
/speckit.analyze [feature-id]
# If CRITICAL/HIGH issues: fix before /sprint-new
```

### Mid-Sprint Check
```
/speckit.analyze [feature-id]
# Validate implementation alignment
```

### Pre-Completion Check
```
/speckit.analyze [feature-id]
# Final validation before /sprint-complete
```

---

## Remediation

After analysis, if fixes needed:

1. **Review findings** with user
2. **Propose changes** (don't auto-apply)
3. **Get approval** before modifying artifacts
4. **Re-run analysis** to verify fixes

**Important**: Never automatically modify files. This is a diagnostic tool only.

---

## Error Handling

| Error | Resolution |
|-------|------------|
| Missing artifacts | Run prerequisite commands first |
| Unparseable file | Check file format |
| > 50 findings | Report summary, full list in separate file |
