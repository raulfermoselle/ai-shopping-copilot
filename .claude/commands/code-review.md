---
description: Review implemented code for quality and compliance
---

# Code Review

Validates implementation code against quality criteria.

## Usage

```
/code-review [sprint-path]
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

1. **Sprint Log** (to get list of modified files)
   ```
   Sprints/{sprint_path}/SPRINT-LOG.md
   ```

2. **Sprint Plan** (to understand what was supposed to be implemented)
   ```
   Sprints/{sprint_path}/SPRINT-PLAN.md
   ```

3. **All Modified Files** (listed in SPRINT-LOG.md)

4. **Project Guardrails**
   ```
   .claude/rules/security.md
   .claude/rules/documentation-system.md
   ```

### Step 3: Apply Review Criteria

#### 3.1 Objective Achievement
- Does the code do what the plan specified?
- Are all planned tasks implemented correctly?
- Are there any incomplete implementations?

#### 3.2 SWE Best Practices
- Clean code principles followed?
- Appropriate error handling?
- No code duplication?
- Proper naming conventions?
- Comments only where non-obvious?

#### 3.3 Performance
- No obvious inefficiencies?
- Appropriate data structures?
- No N+1 query problems?
- Proper use of async patterns (if applicable)?

#### 3.4 Security
- No hardcoded secrets?
- Input validation where needed?
- Proper data isolation/authorization?
- No SQL injection vulnerabilities?
- No XSS vulnerabilities?

#### 3.5 Project Guardrails
- Follows security.md rules?
- Follows documentation-system.md rules?
- Uses existing patterns from codebase?
- Deployment-compatible (stateless if required)?

#### 3.6 Project-Specific Checks (AI Shopping Copilot)

**TypeScript/Node.js:**
- TypeScript strict mode compliant (no `any` types without justification)?
- Proper async/await usage (no floating promises)?
- ES Module imports use `.js` extension?
- Zod schemas used for external data validation?
- Types exported from `types.ts` files?

**Playwright Automation:**
- Uses `page.evaluate()` for bulk DOM extraction (not locator iteration)?
- Selectors from registry (not hardcoded)?
- Proper timeout handling with retries?
- Screenshots captured for debugging?
- No interaction with payment/checkout elements?

**Agent Architecture:**
- Tools are granular (single responsibility)?
- Orchestration decides flow (tools don't call tools)?
- LLM enhances heuristics (graceful degradation if unavailable)?
- Learning subsystems have proper type definitions?

**Safety Constraints:**
- **CRITICAL**: No code path can trigger auto-purchase?
- Cart preparation stops at review stage?
- User approval required before any purchase action?

### Step 4: Document All Issues

For each issue found, record:
- File path
- Line number (approximate)
- Issue description
- Severity level
- Required fix

### Step 5: Produce Result

---

## Issue Severity Levels

| Severity | Definition | Examples |
|----------|------------|----------|
| **CRITICAL** | Security vulnerability or data loss risk | SQL injection, missing tenant isolation, hardcoded secrets |
| **HIGH** | Functionality broken or significant bug | Logic error, missing error handling, broken API |
| **MEDIUM** | Code quality issue | Poor naming, code duplication, missing validation |
| **LOW** | Minor style or optimization | Suboptimal but working, formatting |

---

## Output Format

```markdown
## Code Review Result

**Sprint**: {sprint-id}
**Status**: APPROVED_COMPLETE | FIX_ALL_ISSUES
**Files Reviewed**: {count}

### Objective Achievement
{assessment - 1-2 sentences}

### Best Practices
{assessment - 1-2 sentences}

### Performance
{assessment - 1-2 sentences}

### Security
{assessment - 1-2 sentences}

### Guardrails Compliance
{assessment - 1-2 sentences}

### Issues Found

| File | Line | Issue | Severity | Fix Required |
|------|------|-------|----------|--------------|
| `{path}` | {line} | {description} | CRITICAL | {what to do} |
| `{path}` | {line} | {description} | HIGH | {what to do} |

### Summary
- **Total Issues**: {N}
- **Critical**: {N}
- **High**: {N}
- **Medium**: {N}
- **Low**: {N}

### Verdict
{APPROVED_COMPLETE: ready for next phase | FIX_ALL_ISSUES: must fix before continuing}
```

---

## Status Definitions

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `APPROVED_COMPLETE` | Code passes all checks | Proceed to documentation review |
| `FIX_ALL_ISSUES` | Issues must be fixed | Fix ALL issues, re-run /code-review |

---

## Blocking Policy

**ANY issue found blocks continuation.**

This is the strictest quality gate. All issues (even LOW severity) must be fixed before proceeding. No exceptions, no "ship and fix later".

---

## Rules

- **READ-ONLY**: This command only reads and analyzes, never edits files
- **Review ALL Files**: Never skip any file listed in SPRINT-LOG.md
- **Strict on Security**: CRITICAL issues for any security concern
- **No Exceptions**: ALL issues block, regardless of severity
