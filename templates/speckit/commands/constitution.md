---
description: Update project constitution (Sprint-Speckit Integration)
---

# /speckit.constitution - Constitution Management

This command creates or amends the project constitution that governs all development principles.

## Usage

```
/speckit.constitution [action]
```

**Actions**:
- `init` - Create initial constitution
- `amend` - Modify existing constitution
- `check` - Validate artifacts against constitution
- `show` - Display current constitution

**Examples**:
```
/speckit.constitution init
/speckit.constitution amend "Add Article XI for API versioning"
/speckit.constitution check 001-user-auth
```

---

## Purpose

The constitution establishes immutable principles that:
1. Guide all specification and planning
2. Enforce consistent development practices
3. Enable AI autonomous execution
4. Ensure quality and maintainability

---

## Constitution Location

```
memory/constitution.md
```

This file cascades to all dependent artifacts:
- Specification templates
- Implementation plans
- Task generation
- Analysis checks

---

## Workflow: Init

### Step 1: Check Existing

If constitution exists:
- Offer to view current (`show`)
- Offer to amend (`amend`)
- Abort if user wants to keep existing

### Step 2: Gather Context

From repository:
- README.md (project purpose)
- docs/ (existing standards)
- Previous versions (if any)

From user:
- Project goals
- Team size/structure
- Technology preferences

### Step 3: Generate Constitution

Use `memory/constitution.md` template with:
- Project-specific customizations
- 10 core articles (adjustable)
- Governance rules

### Step 4: Write & Report

Save to `memory/constitution.md` with:
- Version: 1.0.0
- Ratification date: today
- All articles active

---

## Workflow: Amend

### Step 1: Load Current

Read `memory/constitution.md`:
- Current version
- Active articles
- Amendment history

### Step 2: Parse Amendment

From user input, determine:
- New article addition
- Existing article modification
- Rule addition/removal
- Clarification/typo fix

### Step 3: Version Bump

| Change Type | Version Bump |
|-------------|--------------|
| Incompatible principle change | MAJOR (X.0.0) |
| New article or expanded rules | MINOR (1.X.0) |
| Clarification or typo | PATCH (1.0.X) |

### Step 4: Apply Amendment

1. Update article content
2. Update `last_amended` date
3. Add to version history
4. Preserve rationale

### Step 5: Cascade Validation

Check alignment in:
- `templates/speckit/*.md`
- `templates/speckit/commands/*.md`
- Active specs and plans

Report any conflicts requiring attention.

---

## Workflow: Check

Validate feature artifacts against constitution:

### Input
```
/speckit.constitution check [feature-id]
```

### Process

For each article, verify:

| Article | Check |
|---------|-------|
| I. Sprint-First | Feature has sprint allocation |
| II. Spec-Driven | Spec exists before plan |
| III. Test-First | Tests precede implementation |
| IV. Autonomous | No blocking questions |
| V. Context Recovery | Handoff notes present |
| VI. Simplicity | No over-engineering |
| VII. Integration-First | Real test dependencies |
| VIII. Library-First | Modular design |
| IX. Documentation | Artifacts up to date |
| X. Deadlock | Resolution path defined |

### Output

```markdown
## Constitution Check: [feature-id]

| Article | Status | Notes |
|---------|--------|-------|
| I | PASS | Sprint-12 allocated |
| II | PASS | Spec created first |
| III | VIOLATION | T010 before T008 |
| IV | PASS | |
| V | PASS | |
| VI | PASS | |
| VII | PASS | |
| VIII | PASS | |
| IX | WARNING | README not updated |
| X | PASS | |

### Violations (Must Fix)
- Article III: Reorder tasks T008 before T010

### Warnings (Should Fix)
- Article IX: Update README with feature

### Result: FAIL (1 violation)
```

---

## Default Articles

The Sprint Management constitution includes:

| # | Article | Key Rule |
|---|---------|----------|
| I | Sprint-First | All work in sprints |
| II | Spec-Driven | Specs before code |
| III | Test-First | Tests before impl (NON-NEGOTIABLE) |
| IV | Autonomous | No interruptions |
| V | Context Recovery | Full recovery from docs |
| VI | Simplicity | No premature abstraction |
| VII | Integration-First | Real dependencies |
| VIII | Library-First | Modular design |
| IX | Documentation | Docs with code |
| X | Deadlock | Progress over perfection |

---

## Custom Articles

Projects can add custom articles:

```
/speckit.constitution amend "Add Article XI: API Versioning - All APIs must include version in URL path"
```

This adds:
```markdown
## Article XI: API Versioning

**Principle**: All APIs must be versioned.

**Rules**:
1. MUST: Include version in URL path (/v1/, /v2/)
2. MUST: Maintain backward compatibility within major version
3. SHOULD: Document breaking changes in CHANGELOG

**Rationale**: Versioned APIs enable safe evolution without breaking clients.
```

---

## Sprint Integration

### Constitution in Specs

Every spec references constitution:
```markdown
## Constitution Compliance

This feature adheres to:
- Article I: Allocated to Sprint-12
- Article III: Test tasks T008-T009 before T010-T015
```

### Constitution in Analysis

`/speckit.analyze` always checks:
- Constitution alignment
- Violations flagged as CRITICAL
- Must resolve before implementation

### Constitution in Sprint

`/sprint-start` validates:
- Active sprint has constitution-compliant plan
- Warns if violations detected

---

## Output Format

### Init/Amend

```
## Constitution Updated

**Version**: 1.1.0 (was 1.0.0)
**Change**: Added Article XI - API Versioning

### Version Delta
| Aspect | Before | After |
|--------|--------|-------|
| Articles | 10 | 11 |
| Version | 1.0.0 | 1.1.0 |

### Cascade Impact
- templates/speckit/plan-template.md: Updated
- templates/speckit/commands/analyze.md: Updated

### Suggested Commit
```
git commit -m "constitution: Add Article XI - API Versioning

Version 1.0.0 → 1.1.0
- Added API versioning requirements
- Updated templates for new article"
```
```

### Check

```
## Constitution Check: [feature-id]

**Result**: PASS / FAIL
**Violations**: X
**Warnings**: Y

[Detailed table as shown above]
```

---

## Error Handling

| Error | Resolution |
|-------|------------|
| No constitution | Run `/speckit.constitution init` |
| Invalid article ref | Show valid articles |
| Conflicting amendment | Require explicit override |
| Cascade failure | Report affected files |
