---
description: Review and validate a planning sprint
---

# Plan Review

Validates a planning sprint against quality criteria before implementation.

## Usage

```
/plan-review [sprint-path]
```

If no path provided, uses the active sprint from `.sprint-state.local`.

---

## Review Process

### Step 1: Locate the Sprint

```bash
# If path not provided, read from state file
cat Sprints/.sprint-state.local
```

Use `sprint_path` to find the active sprint.

### Step 2: Read Required Files

Read these files before reviewing:

1. **The Sprint Plan**
   ```
   Sprints/{sprint_path}/SPRINT-PLAN.md
   ```

2. **Project Guardrails**
   ```
   .claude/rules/security.md
   .claude/rules/documentation-system.md
   ```

3. **Existing Patterns** (sample relevant files in codebase)

### Step 3: Apply Review Criteria

#### 3.1 Objective Alignment
- Does the plan achieve what the user asked?
- Are the goals clearly defined and measurable?
- Are there missing requirements?

#### 3.2 Code Pattern Compliance
- Does the plan follow existing patterns in the codebase?
- Are there better approaches already implemented?
- Does it leverage existing utilities/components?

#### 3.3 Guardrail Compliance
- Does the plan comply with security rules?
- Does it follow documentation rules?
- Are data isolation/authorization rules respected?

#### 3.4 Completeness
- Are all edge cases considered?
- Are error handling scenarios addressed?
- Are tests included in the plan?

#### 3.5 Feasibility
- Can tasks be done in stated scope?
- Are task counts reasonable (max 5-7 per sprint)?
- Are dependencies correctly identified?

#### 3.6 Project-Specific Constraints (AI Shopping Copilot)

**Architecture Boundaries:**
- Does the plan respect the Coordinator-Worker pattern?
- Are agent responsibilities correctly scoped?
  - CartBuilder: Load/merge orders, cart diff
  - Substitution: Find replacements for unavailable items
  - StockPruner: Remove items based on restock cadence
  - SlotScout: Collect delivery slot options
  - Coordinator: Orchestrate and create review pack

**Tool Design:**
- Are new tools granular (single UI interaction)?
- Does the plan avoid tools calling other tools?
- Is selector registry being used for any new page automation?

**LLM Integration:**
- Does the plan ensure graceful degradation if LLM unavailable?
- Is LLM enhancing (not replacing) heuristics?
- Are Zod schemas defined for structured outputs?

**Memory/Learning:**
- Is new learning data stored in appropriate memory store?
- Are feedback loops clearly defined?
- Is data persistence JSON-based and local?

**Safety Constraints:**
- **CRITICAL**: Does the plan maintain the "never auto-purchase" constraint?
- Is user approval step preserved in any checkout-adjacent features?
- Are payment form interactions explicitly forbidden?

**Selector Strategy:**
- Does the plan include selector discovery before implementation?
- Are fallback selectors considered?
- Is screenshot capture planned for debugging?

### Step 4: Identify Trade-offs

If you find trade-offs (multiple valid approaches):
1. Document each option clearly
2. List pros/cons for each
3. Do NOT make the decision
4. Mark as `USER_DECISION_REQUIRED`

### Step 5: Produce Result

---

## Output Format

```markdown
## Plan Review Result

**Sprint**: {sprint-id}
**Status**: APPROVED | NEEDS_REVISION | USER_DECISION_REQUIRED

### Objective Alignment
{assessment - 1-2 sentences}

### Code Pattern Compliance
{assessment - 1-2 sentences}

### Guardrail Compliance
{assessment - 1-2 sentences}

### Completeness
{assessment - 1-2 sentences}

### Feasibility
{assessment - 1-2 sentences}

### Issues Found
| Issue | Severity | Action Required |
|-------|----------|-----------------|
| {issue} | HIGH/MEDIUM/LOW | {what to fix} |

### Trade-offs Requiring User Decision
- [ ] **{trade-off title}**
  - Option A: {description} - Pros: {pros}, Cons: {cons}
  - Option B: {description} - Pros: {pros}, Cons: {cons}

### Summary
{1-2 sentences with final recommendation}
```

---

## Status Definitions

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `APPROVED` | Plan is ready for implementation | Proceed to user approval, then implementation |
| `NEEDS_REVISION` | Issues found that must be fixed | Fix issues in SPRINT-PLAN.md, re-run /plan-review |
| `USER_DECISION_REQUIRED` | Trade-offs need user input | Present trade-offs to user, get decision, update plan |

---

## Rules

- **READ-ONLY**: This command only reads and analyzes, never edits files
- **No Architecture Changes**: Flag concerns but don't propose alternatives
- **No User Decisions**: Never decide trade-offs, only present options
- **Strict on Guardrails**: Never approve plans violating security or documentation rules
