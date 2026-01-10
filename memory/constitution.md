# Project Constitution

<!--
  Sprint Management Framework Constitution
  Version: 1.0.0
  Ratification Date: [PROJECT_START_DATE]
  Last Amended: [LAST_AMENDMENT_DATE]

  This constitution establishes immutable principles for AI-assisted development.
  All specifications, plans, and implementations MUST align with these principles.
-->

---

## Preamble

This constitution governs the development practices for projects using the Sprint Management Framework. It integrates with GitHub's Spec-Kit methodology to ensure consistent, high-quality, AI-assisted development.

---

## Article I: Sprint-First Development

**Principle**: All development work MUST be organized within sprints.

**Rules**:
1. MUST: No ad-hoc code changes outside of sprint context
2. MUST: Each sprint contains maximum 5-7 tasks (AI context aware)
3. MUST: Sprints link to previous and next sprints
4. SHOULD: Sprint scope fits within single context window

**Rationale**: Sprints provide structured checkpoints for AI context preservation, ensuring continuity and traceability across sessions.

---

## Article II: Specification-Driven Implementation

**Principle**: Specifications drive implementation, not the reverse.

**Rules**:
1. MUST: Features begin with /speckit.specify before any code
2. MUST: Implementation plans generated via /speckit.plan
3. MUST: Tasks derived from plans via /speckit.tasks
4. MUST NOT: Write code before specification approval

**Rationale**: Specifications as primary artifacts ensure intent clarity and reduce implementation ambiguity.

---

## Article III: Test-First Development (NON-NEGOTIABLE)

**Principle**: Tests MUST exist and fail before implementation code.

**Rules**:
1. MUST: Write tests before implementation
2. MUST: Tests must fail initially (red phase)
3. MUST: Implementation makes tests pass (green phase)
4. MUST: Refactor only after green (refactor phase)
5. MUST NOT: Skip tests for "simple" changes

**Rationale**: Test-first ensures every feature has verification from inception, preventing regression and documenting behavior.

---

## Article IV: Autonomous Execution

**Principle**: AI executes sprint tasks without interruption.

**Rules**:
1. MUST NOT: Stop to ask clarifying questions during execution
2. MUST: Document decisions autonomously in SPRINT-LOG.md
3. MUST: Follow existing codebase patterns
4. MUST: Log uncertainties and continue execution
5. SHOULD: Declare deadlock after 3 failed attempts, not before

**Rationale**: Continuous execution maintains momentum; interruptions fragment context and slow delivery.

---

## Article V: Context Recovery

**Principle**: Every session can recover full context from documentation.

**Rules**:
1. MUST: MASTER-SPRINT.md serves as recovery entry point
2. MUST: Sprint logs capture all decisions and progress
3. MUST: Handoff notes document next-session requirements
4. SHOULD: Context recovery takes < 5 minutes

**Rationale**: AI sessions are ephemeral; documentation ensures no knowledge is lost between sessions.

---

## Article VI: Simplicity Over Abstraction

**Principle**: Start simple; add complexity only when justified.

**Rules**:
1. MUST: Initial implementations limited to immediate needs
2. MUST NOT: Create abstractions for single use cases
3. MUST NOT: Add features for "future" requirements
4. SHOULD: Three similar lines better than premature abstraction

**Rationale**: Over-engineering creates maintenance burden and cognitive overhead without immediate value.

---

## Article VII: Integration-First Testing

**Principle**: Real dependencies over mocks wherever practical.

**Rules**:
1. MUST: Use real databases in integration tests
2. MUST: Use actual service instances when available
3. SHOULD: Contract tests for external dependencies
4. MAY: Mock only at system boundaries (external APIs)

**Rationale**: Real integrations catch issues mocks hide; they test actual behavior, not assumptions.

---

## Article VIII: Library-First Architecture

**Principle**: Features start as reusable components.

**Rules**:
1. SHOULD: New features begin as standalone libraries
2. SHOULD: Clear interfaces before integration
3. MUST: Dependency injection over hard-coded dependencies
4. MUST NOT: Tightly couple features to specific applications

**Rationale**: Modular design enables reuse, testing in isolation, and cleaner architecture.

---

## Article IX: Documentation as Code

**Principle**: Documentation lives with code and evolves together.

**Rules**:
1. MUST: Sprint documentation in version control
2. MUST: Specifications updated when requirements change
3. MUST NOT: Let documentation drift from implementation
4. SHOULD: README reflects current state always

**Rationale**: Stale documentation misleads; co-located docs encourage maintenance.

---

## Article X: Deadlock Resolution

**Principle**: Progress over perfection; blocked tasks don't stop sprints.

**Rules**:
1. MUST: Declare deadlock after 3 consecutive failures
2. MUST: Log deadlock in EXCEPTIONS-LOG.md
3. MUST: Mark task BLOCKED and continue to next
4. MUST NOT: Stop entire workflow for single task
5. SHOULD: Review blocked tasks in dedicated session

**Rationale**: Forward momentum maintains productivity; blockers are isolated problems, not workflow stoppers.

---

## Governance

### Amendment Process

1. Amendments require explicit user approval
2. Version bumping:
   - MAJOR: Incompatible principle changes
   - MINOR: New principles or expanded rules
   - PATCH: Clarifications or typo fixes
3. All amendments logged with rationale

### Enforcement

1. /speckit.analyze validates constitution alignment
2. Checklists include constitution checks
3. Sprint reviews verify principle adherence

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | [DATE] | Initial constitution | System |

---

<!-- CONSTITUTION METADATA - DO NOT EDIT BELOW -->
```yaml
constitution:
  version: "1.0.0"
  ratification_date: "[PROJECT_START_DATE]"
  last_amended: "[LAST_AMENDMENT_DATE]"
  principles_count: 10
  articles:
    - id: I
      name: "Sprint-First Development"
      status: active
    - id: II
      name: "Specification-Driven Implementation"
      status: active
    - id: III
      name: "Test-First Development"
      status: active
      non_negotiable: true
    - id: IV
      name: "Autonomous Execution"
      status: active
    - id: V
      name: "Context Recovery"
      status: active
    - id: VI
      name: "Simplicity Over Abstraction"
      status: active
    - id: VII
      name: "Integration-First Testing"
      status: active
    - id: VIII
      name: "Library-First Architecture"
      status: active
    - id: IX
      name: "Documentation as Code"
      status: active
    - id: X
      name: "Deadlock Resolution"
      status: active
```
