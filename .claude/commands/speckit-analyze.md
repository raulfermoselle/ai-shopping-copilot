---
description: Analyze artifacts for consistency
---

# /speckit-analyze - Consistency Analysis

Performs read-only cross-artifact consistency analysis.

## Usage

```
/speckit-analyze [feature-id]
```

## Purpose

Analyze alignment between:
- `spec.md` - Feature specification
- `plan.md` - Implementation plan
- `tasks.md` - Task breakdown
- `memory/constitution.md` - Project principles

**Important**: This is READ-ONLY. Reports issues but never modifies files.

## Execution Steps

### 1. Load Artifacts

```python
feature_dir = f"Sprints/Specs/{feature_id}"

spec = read_file(f"{feature_dir}/spec.md")
plan = read_file(f"{feature_dir}/plan.md")
tasks = read_file(f"{feature_dir}/tasks.md")
constitution = read_file("memory/constitution.md")

if any_missing([spec, plan, tasks]):
    error("Missing artifacts - run prerequisite commands")
```

### 2. Build Semantic Models

**Requirements Inventory**:
```
REQ-001: User can register → US1
REQ-002: User can login → US1
REQ-003: Password reset → US2
```

**Task Mapping**:
```
T001 → SETUP
T008 → REQ-001, REQ-002
T016 → REQ-003
```

### 3. Run Detection Passes

#### Duplication Detection
- Near-identical requirements
- Overlapping tasks
- Consolidation candidates

#### Ambiguity Detection
- Vague terms: "fast", "easy", "many"
- Unresolved: TODO, ???, [NEEDS CLARIFICATION]
- Missing acceptance criteria

#### Underspecification Detection
- Requirements without tasks
- Tasks without outcomes
- Missing error handling

#### Constitution Alignment
- Article violations
- Test-first ordering
- Simplicity violations

#### Coverage Analysis
- Requirements with zero tasks
- Orphan tasks (no requirement)

#### Inconsistency Detection
- Terminology drift
- Data model conflicts
- Task ordering issues

### 4. Severity Assignment

| Severity | Criteria |
|----------|----------|
| CRITICAL | Constitution violation, P1 zero coverage |
| HIGH | Conflicts, untestable criteria |
| MEDIUM | Ambiguity, minor gaps |
| LOW | Style, minor inconsistency |

### 5. Generate Report

---

## Output Example

```
## Analysis Report: 001-user-authentication

**Generated**: 2024-01-15 14:30
**Artifacts**: spec.md, plan.md, tasks.md

### Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 1 |
| **Total** | **6** |

### Coverage Metrics
| Metric | Value |
|--------|-------|
| Requirements | 8 |
| Tasks | 25 |
| Coverage | 88% |
| Unmapped Reqs | 1 |
| Orphan Tasks | 0 |

### Findings

| ID | Severity | Category | Location | Issue |
|----|----------|----------|----------|-------|
| A001 | HIGH | Coverage | REQ-005 | No tasks for "password reset" |
| A002 | HIGH | Constitution | T008-T010 | Tests not before implementation |
| A003 | MEDIUM | Ambiguity | spec.md:45 | "fast response" undefined |
| A004 | MEDIUM | Terminology | plan.md | "user" vs "account" |
| A005 | MEDIUM | Gap | tasks.md | No error handling tasks |
| A006 | LOW | Style | spec.md:12 | Inconsistent priority format |

### Constitution Alignment

| Article | Status | Notes |
|---------|--------|-------|
| I. Sprint-First | PASS | 2 sprints allocated |
| II. Spec-Driven | PASS | Plan from spec |
| III. Test-First | VIOLATION | T008-T010 ordering |
| IV. Autonomous | PASS | |
| V. Context Recovery | PASS | Handoff documented |
| VI. Simplicity | PASS | |
| VII. Integration-First | PASS | |
| VIII. Library-First | PASS | |
| IX. Documentation | WARNING | README pending |
| X. Deadlock | PASS | |

### Recommended Actions

**Immediate (CRITICAL/HIGH)**:
1. Add tasks for REQ-005 (password reset)
2. Reorder: T008 (tests) before T010 (implementation)

**Suggested (MEDIUM)**:
3. Define "fast response" as < 200ms in spec
4. Standardize "user" terminology
5. Add error handling tasks

**Optional (LOW)**:
6. Fix priority format in spec

### Next Steps
- Fix HIGH issues before implementation
- Re-run analysis after fixes
- Proceed to `/speckit-implement` when clean
```

---

## When to Run

| Timing | Purpose |
|--------|---------|
| After `/speckit-tasks` | Validate before sprint |
| During sprint | Check alignment |
| Before `/sprint-complete` | Final check |
| After scope changes | Re-validate |

---

## Integration Points

- **Before**: `/speckit-tasks`
- **After**: Fix issues, then `/speckit-implement`
- **Sprint**: Pre-completion validation

---

## Error Handling

| Error | Action |
|-------|--------|
| Missing artifacts | Run prerequisite commands |
| > 50 findings | Summarize, full report separate |
| Unparseable | Check file format |
