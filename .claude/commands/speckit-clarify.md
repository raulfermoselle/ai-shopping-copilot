---
description: Resolve specification ambiguities
---

# /speckit-clarify - Clarification

Identifies and resolves underspecified areas in specifications.

## Usage

```
/speckit-clarify [feature-id]
```

## Execution Steps

### 1. Load Specification

```python
spec = read_file(f"Sprints/Specs/{feature_id}/spec.md")
```

### 2. Ambiguity Scan

Scan 9 categories:

| Category | Look For |
|----------|----------|
| Functional Scope | "should handle", "may include" |
| Data Models | Undefined entities |
| UX Flows | Unclear journeys |
| Non-Functional | "fast", "scalable" without metrics |
| Integration | External systems unspecified |
| Edge Cases | "etc.", "and so on" |
| Constraints | Missing limits |
| Terminology | Undefined terms |
| Completion | How to know done |

### 3. Prioritize Questions

Rank by: Impact × Uncertainty

**Limits**:
- Max 5 questions per session
- Max 10 total across sessions
- Skip low-impact items

### 4. Present Questions

#### Multiple Choice

```markdown
### Question 1/5: Session Timeout

The spec mentions "session management" but doesn't specify timeout.

**What should happen when session times out?**

| Option | Description |
|--------|-------------|
| **A** | Redirect to login with message (Recommended) |
| B | Auto-extend if user active |
| C | Force re-authentication |

Reply: letter, "yes" for recommended, or custom.
```

#### Short Answer

```markdown
### Question 2/5: Password Length

**What minimum password length?**

Suggested: 12 characters

Reply: "yes" or enter value.
```

### 5. Integrate Answers

After each answer:

1. Add to Clarifications section:
   ```markdown
   ## 7. Clarifications

   ### 2024-01-15 - Session Clarifications

   - **Q**: Session timeout behavior?
     **A**: Redirect to login with message
     **Impact**: Updated FR003, added EC005
   ```

2. Update relevant sections

3. Save atomically

### 6. Report Completion

```markdown
## Clarification Complete

**Feature**: 001-user-authentication
**Session**: 2024-01-15

### Questions Resolved
| # | Category | Answer | Updated |
|---|----------|--------|---------|
| 1 | Non-Func | 12 chars | FR003 |
| 2 | Edge Case | Redirect | EC005 |

### Coverage Improvement
| Category | Before | After |
|----------|--------|-------|
| Functional | 85% | 95% |
| Non-Functional | 60% | 90% |

### Remaining
- [NEEDS CLARIFICATION]: 0
- Low-priority: 2 (deferred)

### Next Steps
1. Review updated spec
2. Run `/speckit-plan` if ready
```

---

## Stopping Conditions

- All critical ambiguities resolved
- User says "done" or "skip"
- Reached 5 questions
- No ambiguities found

---

## Integration Points

- **Before**: `/speckit-specify`
- **After**: `/speckit-plan`
- **Sprint**: Improves task estimates
