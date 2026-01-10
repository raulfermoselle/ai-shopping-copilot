---
description: Resolve ambiguities in specifications (Sprint-Speckit Integration)
---

# /speckit.clarify - Specification Clarification

This command identifies and resolves underspecified areas in feature specifications through targeted Q&A.

## Usage

```
/speckit.clarify [feature-id]
```

**Example**:
```
/speckit.clarify 001-user-auth
```

---

## Purpose

Reduce ambiguity in specifications by:
1. Scanning for unclear areas
2. Generating targeted questions
3. Integrating answers into spec
4. Validating completeness

---

## When to Run

| Timing | Purpose |
|--------|---------|
| After `/speckit.specify` | Resolve initial ambiguities |
| Before `/speckit.plan` | Ensure spec is complete |
| After stakeholder review | Incorporate feedback |
| When `[NEEDS CLARIFICATION]` present | Resolve markers |

---

## Workflow

### Step 1: Load Specification

Read `Sprints/Specs/[feature-id]/spec.md`

If not found: Error - run `/speckit.specify` first.

### Step 2: Ambiguity Scan

Scan across 9 taxonomy categories:

| Category | Examples |
|----------|----------|
| Functional Scope | "should handle", "may include" |
| Data Models | Undefined entities, missing fields |
| UX Flows | Unclear user journeys |
| Non-Functional | "fast", "scalable", "secure" without metrics |
| Integration Points | External systems not specified |
| Edge Cases | "etc.", "and so on" |
| Constraints | Missing limits or boundaries |
| Terminology | Undefined domain terms |
| Completion Signals | How to know when done |

### Step 3: Prioritize Questions

Rank by impact-uncertainty heuristic:

```
Priority = Impact × Uncertainty

High Impact: Security, core functionality, P1 stories
High Uncertainty: No reasonable default, multiple interpretations
```

**Limits**:
- Maximum 5 questions per session
- Maximum 10 questions across all sessions
- Skip low-impact items

### Step 4: Question Presentation

#### Multiple Choice (2-5 options)

```markdown
### Question 1/5: Session Timeout

The spec mentions "session management" but doesn't specify timeout behavior.

**What should happen when a user session times out?**

| Option | Description |
|--------|-------------|
| **A** | Redirect to login with message (Recommended) |
| B | Auto-extend if user active |
| C | Force re-authentication |
| D | Configurable per-user setting |

Reply with letter, "yes" for recommended, or custom answer.
```

#### Short Answer (≤5 words)

```markdown
### Question 2/5: Password Length

The spec requires "strong passwords" but doesn't define minimum length.

**What minimum password length should be enforced?**

Suggested: 12 characters

Reply "yes" for suggested, or enter custom value.
```

### Step 5: Answer Integration

After each answer:

1. **Create/update Clarifications section**:
   ```markdown
   ## 7. Clarifications

   ### 2024-01-15 - Session Clarifications

   - **Q**: Session timeout behavior?
     **A**: Redirect to login with message
     **Impact**: Updated FR003, added edge case EC005
   ```

2. **Update relevant sections**:
   - Functional requirements
   - Data model
   - Edge cases
   - Success criteria

3. **Save atomically** after each update

4. **Validate** no duplicates or contradictions

### Step 6: Completion Report

```markdown
## Clarification Complete

**Feature**: [feature-id]
**Session**: [date]

### Questions Asked
| # | Category | Answer | Sections Updated |
|---|----------|--------|------------------|
| 1 | Non-Functional | 12 chars | FR003, BR002 |
| 2 | Edge Cases | Redirect | EC005 |
| 3 | Data Model | UUID | Entity: User |

### Sections Modified
- Functional Requirements: 2 updates
- Edge Cases: 1 addition
- Data Model: 1 clarification

### Coverage Summary
| Category | Before | After |
|----------|--------|-------|
| Functional | 85% | 95% |
| Non-Functional | 60% | 90% |
| Edge Cases | 70% | 85% |

### Remaining Items
- [NEEDS CLARIFICATION] markers: 0
- Low-priority ambiguities: 2 (deferred)

### Next Steps
1. Review updated spec
2. Run `/speckit.plan` if ready
3. Run `/speckit.clarify` again if more questions needed
```

---

## Stopping Conditions

Stop clarification when:

1. All critical ambiguities resolved
2. User signals completion ("done", "no more", "skip")
3. Reached 5 questions this session
4. No meaningful ambiguities detected

---

## Sprint Integration

### Impact on Planning

Clarifications affect:
- Task estimates (clearer scope)
- Sprint allocation (better sizing)
- Risk assessment (fewer unknowns)

### Traceability

Each clarification records:
- Question asked
- Answer given
- Sections updated
- Date/session

This supports constitution Article V (Context Recovery).

---

## Question Guidelines

**Good Questions**:
- Impact scope, security, or UX significantly
- Have no reasonable default
- Multiple valid interpretations exist

**Avoid Asking**:
- Implementation details (HOW)
- Low-impact details
- Questions with obvious answers
- Already-answered questions

---

## Output Format

### During Clarification

Present one question at a time with:
- Clear context
- Recommended option (if multiple choice)
- Impact explanation
- Easy response format

### Completion

Summary showing:
- Questions asked and answers
- Sections modified
- Coverage improvement
- Remaining ambiguities

---

## Error Handling

| Error | Resolution |
|-------|------------|
| Spec not found | Run `/speckit.specify` first |
| Contradictory answers | Flag and ask for resolution |
| User skips critical | Warn about risks, allow skip |
| No ambiguities found | Report spec is complete |
