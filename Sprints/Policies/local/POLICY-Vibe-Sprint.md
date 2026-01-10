# Vibe Sprint Policy

<!-- LOCK_STATUS: MICHELIN -->
<!-- LOCK_REASON: Core development workflow policy -->

## Core Principle

**All Vibe (AI-assisted) development MUST be executed through sprints. No ad-hoc instructions are permitted.**

---

## Why Sprints for Vibe Coding?

1. **Context Preservation**: AI has limited context memory; sprints provide structured checkpoints
2. **Traceability**: Every change is documented and linked
3. **Continuity**: Sprints link to next sprints, enabling seamless handoffs
4. **Quality**: Smaller, focused tasks reduce errors
5. **Recoverability**: If context is lost, sprint docs provide recovery path

---

## Sprint Rules

### Rule 1: No Ad-Hoc Development

- All code changes must be part of a sprint
- Human CLI prompts should refine policies, not execute direct code changes
- If a quick fix is needed, create a micro-sprint (Sprint-XXX-hotfix)

### Rule 2: Sprint Size Limits (AI Context Aware)

Due to AI context limitations, sprints must be:
- **Maximum 5-7 tasks** per sprint
- **Each task should be completable in one context session**
- **Complex tasks must be broken into sub-sprints**

### Rule 3: Sprint Linking

Every sprint must include:
- Link to previous sprint (what was completed)
- Link to next sprint (what should follow)
- Current sprint status and blockers

### Rule 4: Context Reset Protocol

At the end of each sprint:
1. Complete sprint log with execution details
2. Update master sprint status
3. Run `/clear` command
4. Load README.md to re-establish context
5. Resume from next sprint

### Rule 5: Testing Requirements by Sprint Type

Not all sprints require tests. Requirements vary by sprint type:

| Sprint Type | Code | Tests Required | Coverage Target |
|-------------|------|----------------|-----------------|
| Research (R-XXX) | No | No | N/A |
| Architecture (A-XXX) | No | No | N/A |
| Documentation (D-XXX) | No | No | N/A |
| Implementation (I-XXX) | Yes | **Yes** | 60% minimum |
| Bug Fix (B-XXX) | Yes | **Yes** | Maintain existing |
| Hotfix (H-XXX) | Yes | **Yes** | Maintain existing |

**Key Rules**:
- Implementation sprints **cannot be marked complete** without passing tests
- Research/Architecture/Documentation sprints are exempt from test requirements
- Hotfixes must not decrease existing code coverage

### Rule 6: Concurrent Sprint Rules

When `concurrency.enabled: true` in sprint.config.yaml:

1. **Branch Isolation**: Each Git branch has its own sprint namespace
2. **Sprint Naming**: Pattern `Sprint-{BRANCH_SHORT}-{NUMBER:02d}-{NAME}`
3. **Local State**: Use `.sprint-state.local` (gitignored) for branch-specific tracking
4. **No Cross-Branch Sprints**: Never work on another branch's sprint
5. **Merge Protocol**: Update SPRINT-INDEX.md with "Merged To" after branch merge
6. **Archive on Delete**: Move sprints to Archive/ when branch is deleted

**Branch Naming Transformation:**
- Strip prefixes: `feat/`, `feature/`, `fix/`, `bugfix/`, `hotfix/`, `chore/`
- Truncate to max 20 chars
- Special cases: `main` → `main`, `develop` → `dev`

### Rule 7: Continuous Improvement Through Lessons Learned

Every sprint completion must include lessons learned evaluation:

**Process**:
1. **Capture**: Document lessons in SPRINT-LOG.md "Lessons Learned" section
2. **Evaluate**: Score against incorporation criteria
3. **Decide**: Incorporate into policies, log only, or defer
4. **Update**: If incorporating, update policy + LESSONS-LEARNED.md

**Evaluation Criteria** (must score 3+ High to incorporate):
| Criterion | Question |
|-----------|----------|
| Recurrence | Has this occurred multiple times? |
| Impact | Did it cause significant delays/failures? |
| Generalizability | Does it apply beyond this sprint? |
| Actionability | Can it be expressed as a clear rule? |

---

## Sprint Execution Checklist

### Before Starting a Sprint
- [ ] Read MASTER-SPRINT.md for current project state
- [ ] Read the sprint plan
- [ ] Verify prerequisites are met
- [ ] Check estimated context usage

### During Sprint
- [ ] Update SPRINT-LOG.md as work progresses
- [ ] Mark tasks complete as they finish
- [ ] Note any blockers or decisions
- [ ] Execute autonomously (no questions)

### After Sprint
- [ ] Complete SPRINT-LOG.md with final status
- [ ] Update MASTER-SPRINT.md
- [ ] Evaluate lessons learned
- [ ] Commit and push changes
- [ ] Run `/clear` if context exhausted

---

## Human CLI Prompt Guidelines

### DO:
- Refine and update policies
- Approve sprint plans
- Review completed sprints
- Provide strategic direction
- Clarify requirements

### DON'T:
- Request direct code changes outside sprints
- Skip sprint documentation
- Ignore context limits
- Make ad-hoc modifications

### Example Good Prompts:
```
"Create a sprint plan to add feature X"
"Review Sprint-01 and approve moving to Sprint-02"
"Update the coding policy to require X"
```

### Example Bad Prompts (Avoid):
```
"Just quickly add a function to do X"
"Fix this bug real quick"
"Change the code to use X instead"
```

---

## Related Policies

- [POLICY-AI-Context-Management.md](./POLICY-AI-Context-Management.md) - Context handling
- [POLICY-Global-Scheduler.md](./POLICY-Global-Scheduler.md) - Scheduler workflow

---

*Version 2.0 - Part of Sprint Management Framework*
